import {authToken,bodyJSON,digest,fail,json,newRoomCode,roomCode} from './common.mjs';
export {Directory} from './directory.mjs';
export {GameRoom} from './room.mjs';

export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',');
    if(origin&&!allowed.includes(origin))return fail('origin_not_allowed',403);
    const cors={'Access-Control-Allow-Origin':origin||allowed[0]||'null','Vary':'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Max-Age':'86400'};
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    try {
      const result=await route(request,env);
      // WebSocket upgrade headers/response must remain untouched.
      if(result.status===101)return result;
      const headers=new Headers(result.headers);for(const [k,v] of Object.entries(cors))headers.set(k,v);
      headers.set('X-Content-Type-Options','nosniff');
      return new Response(result.body,{status:result.status,headers});
    }catch(error){
      const reason=['invalid_body','message_too_long'].includes(error.message)?error.message:'service_unavailable';
      return new Response(JSON.stringify({ok:false,reason}),{status:reason==='service_unavailable'?503:400,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
    }
  }
};
async function route(request,env) {
  const url=new URL(request.url),path=url.pathname.replace(/\/$/,'');
  if(path==='/health'&&request.method==='GET')return json({ok:true,service:'sozcuk-zinciri-online',version:1});
  const directory=env.DIRECTORY.getByName('accounts-v1');
  if(path==='/v1/register'&&request.method==='POST'){
    const body=await bodyJSON(request);
    const trustedGateway=Boolean(env.GATEWAY_KEY&&request.headers.get('X-Zincir-Gateway')===env.GATEWAY_KEY);
    const forwarded=request.headers.get('X-Zincir-Client');
    const ip=trustedGateway&&forwarded&&/^[0-9a-fA-F:.]{3,64}$/.test(forwarded)?forwarded:request.headers.get('CF-Connecting-IP')||'local';
    return response(await directory.register(body.name,await digest(ip),trustedGateway?80:10));
  }
  const websocket=path.startsWith('/ws/');
  const token=websocket?url.searchParams.get('token'):authToken(request);
  const profile=await directory.authenticate(token);
  if(!profile)return fail('unauthorized',401);
  if(websocket){
    if(request.method!=='GET'||request.headers.get('upgrade')?.toLowerCase()!=='websocket')return fail('websocket_required',426);
    const headers=new Headers(request.headers);headers.set('X-Player-Id',profile.id);
    const clean=new URL(request.url);clean.search='';
    const forwarded=new Request(clean,{headers});
    if(path==='/ws/lobby')return directory.fetch(forwarded);
    const match=path.match(/^\/ws\/rooms\/([A-Z2-9]{6})$/),code=match&&roomCode(match[1]);
    return code?env.ROOMS.getByName(code).fetch(forwarded):fail('room_not_found',404);
  }
  if(path==='/v1/me'&&request.method==='GET')return json({ok:true,profile,activeRoom:profile.activeRoom});
  if(path==='/v1/friends'&&request.method==='GET')return response(await directory.friends(profile.id));
  if(request.method!=='POST')return fail('not_found',404);
  const body=await bodyJSON(request);
  if(path==='/v1/profile')return response(await directory.rename(profile.id,body.name));
  if(path==='/v1/friends/request')return response(await directory.requestFriend(profile.id,body.code));
  if(path==='/v1/friends/respond')return response(await directory.respondFriend(profile.id,body.userId,body.accept));
  if(path==='/v1/friends/remove')return response(await directory.removeFriend(profile.id,body.userId));
  if(path==='/v1/rooms'){
    // Recover a current room rather than accidentally creating duplicates on a
    // retried request. Closed reservations are cleared server-side.
    if(profile.activeRoom){
      const prior=await env.ROOMS.getByName(profile.activeRoom).status(profile.id);
      if(prior.ok&&prior.member&&prior.phase!=='finished')return json({ok:true,roomCode:profile.activeRoom});
      await directory.releaseRoom(profile.id,profile.activeRoom);
    }
    for(let i=0;i<5;i++){
      const code=newRoomCode(),reservation=await directory.reserveRoom(profile.id,code);
      if(!reservation.ok)return response(reservation);
      let result;
      try{result=await env.ROOMS.getByName(code).initialize(code,profile);}
      catch(error){await directory.releaseRoom(profile.id,code);throw error;}
      if(result.ok)return response(result);
      await directory.releaseRoom(profile.id,code);
    }
    return fail('service_unavailable',503);
  }
  const route=path.match(/^\/v1\/rooms\/([A-Z2-9]{6})\/(join|invite)$/),code=route&&roomCode(route[1]);
  if(!code)return fail('not_found',404);
  const room=env.ROOMS.getByName(code);
  if(route[2]==='join'){
    if(profile.activeRoom&&profile.activeRoom!==code){
      const old=await env.ROOMS.getByName(profile.activeRoom).status(profile.id);
      if(old.ok&&old.member&&old.phase!=='finished')return fail('already_in_room',409);
      await directory.releaseRoom(profile.id,profile.activeRoom);
    }
    const reserved=await directory.reserveRoom(profile.id,code);if(!reserved.ok)return response(reserved);
    const result=await room.join(profile);if(!result.ok)await directory.releaseRoom(profile.id,code);
    return response(result);
  }
  const status=await room.status(profile.id);
  if(!status.ok||!status.member||status.phase==='finished')return fail('not_player',403);
  return response(await directory.invite(profile.id,body.userId,code));
}
function response(result){return json(result,result.ok?200:result.reason==='rate_limited'?429:400);}

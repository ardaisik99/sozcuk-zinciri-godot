// Optional Google Play backend. Disabled until the owner configures Play.
// No client receipt grants anything without Google's signed-in server response.
const PRODUCTS = Object.freeze({
  hint_pack_10: {consumable:true}, letter_pack_25: {consumable:true},
  gold_500: {consumable:true}, gold_1500: {consumable:true},
  remove_ads: {consumable:false},
});
const encoder = new TextEncoder();
const tokenCache = new Map();
const fault = code => Object.assign(new Error(code), {code});
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const encodeJSON = value => base64url(encoder.encode(JSON.stringify(value)));

export function billingConfigured(env) {
  if(env.GOOGLE_PLAY_ENABLED!=='true'||!/^([a-zA-Z]\w*\.)+[a-zA-Z]\w*$/.test(env.GOOGLE_PLAY_PACKAGE_NAME||''))return false;
  try {const c=JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);return typeof c.client_email==='string'&&typeof c.private_key==='string'&&c.private_key.includes('BEGIN PRIVATE KEY');}catch{return false;}
}
export async function billingAccountId(accountId) {
  const bytes=await crypto.subtle.digest('SHA-256',encoder.encode('zincir:'+accountId));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function accessToken(env,fetcher,now) {
  const credentials=JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  const cacheKey=credentials.client_email+'|'+env.GOOGLE_PLAY_PACKAGE_NAME;
  const cached=tokenCache.get(cacheKey);
  if(cached?.expiresAt>now+60_000)return cached.value;
  const pem=credentials.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  let key;
  try {key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);}catch{throw fault('billing_configuration_invalid');}
  const iat=Math.floor(now/1000);
  const unsigned=encodeJSON({alg:'RS256',typ:'JWT'})+'.'+encodeJSON({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600});
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(unsigned));
  const response=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+base64url(new Uint8Array(signature))}),signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw fault('billing_provider_unavailable');
  const body=await response.json();
  if(typeof body.access_token!=='string'||!body.access_token)throw fault('billing_provider_unavailable');
  tokenCache.set(cacheKey,{value:body.access_token,expiresAt:now+Math.min(Number(body.expires_in)||300,3600)*1000});
  return body.access_token;
}
function purchaseURL(env,productId,purchaseToken) {
  return 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+encodeURIComponent(env.GOOGLE_PLAY_PACKAGE_NAME)+'/purchases/products/'+encodeURIComponent(productId)+'/tokens/'+encodeURIComponent(purchaseToken);
}

export async function verifyGooglePurchase(env,{productId,purchaseToken,accountId},dependencies={}) {
  if(!billingConfigured(env))throw fault('billing_not_configured');
  const product=PRODUCTS[productId];
  if(!product||(productId==='remove_ads'&&env.ADS_ENABLED!=='true'))throw fault('product_unavailable');
  if(typeof accountId!=='string'||!accountId||typeof purchaseToken!=='string'||purchaseToken.length<8||purchaseToken.length>4096||/[\u0000-\u001f\u007f]/u.test(purchaseToken))throw fault('invalid_purchase');
  const fetcher=dependencies.fetch||fetch,now=dependencies.now??Date.now();
  const token=await accessToken(env,fetcher,now);
  const response=await fetcher(purchaseURL(env,productId,purchaseToken),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw fault(response.status===404||response.status===410?'invalid_purchase':'billing_provider_unavailable');
  const purchase=await response.json();
  if(purchase.purchaseState===2)throw fault('purchase_pending');
  if(purchase.purchaseState!==0)throw fault('purchase_not_completed');
  if(purchase.productId&&purchase.productId!==productId)throw fault('purchase_product_mismatch');
  if(purchase.purchaseToken&&purchase.purchaseToken!==purchaseToken)throw fault('invalid_purchase');
  if(purchase.obfuscatedExternalAccountId!==await billingAccountId(accountId))throw fault('purchase_account_mismatch');
  const quantity=purchase.quantity??1;
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100||(!product.consumable&&quantity!==1))throw fault('invalid_purchase_quantity');
  if(typeof purchase.refundableQuantity==='number'&&purchase.refundableQuantity<quantity)throw fault('purchase_refunded');
  const hash=await crypto.subtle.digest('SHA-256',encoder.encode(purchaseToken));
  return {accountId,productId,quantity,purchaseTokenHash:[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join(''),purchaseToken,consumable:product.consumable,consumed:purchase.consumptionState===1,acknowledged:purchase.acknowledgementState===1,purchasedAt:Number(purchase.purchaseTimeMillis)||now,orderId:typeof purchase.orderId==='string'?purchase.orderId:null};
}

// Call ONLY after the Directory transaction has durably granted the product.
// Retrying a granted receipt is safe: the server ledger prevents double grants.
export async function acknowledgeGooglePurchase(env,verified,dependencies={}) {
  if(!billingConfigured(env))throw fault('billing_not_configured');
  if(verified.consumable?verified.consumed:verified.acknowledged)return {ok:true,alreadyAcknowledged:true};
  const fetcher=dependencies.fetch||fetch,token=await accessToken(env,fetcher,dependencies.now??Date.now());
  const action=verified.consumable?'consume':'acknowledge';
  const response=await fetcher(purchaseURL(env,verified.productId,verified.purchaseToken)+':'+action,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:verified.consumable?undefined:'{}',signal:AbortSignal.timeout(10_000)});
  if(!response.ok)throw fault('purchase_acknowledgement_pending');
  return {ok:true};
}

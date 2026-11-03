# Sözcük Zinciri online protocol v1

Transport: HTTPS JSON REST for account/social/room setup; one hibernating WebSocket for the current room. Browser front end stays on GitHub Pages. Native Godot uses exactly the same API. Backend: Cloudflare Workers + SQLite Durable Objects (`Directory`, `GameRoom`), no paid plan or external database required for initial free-tier usage. All timestamps are Unix milliseconds.

## Identity

Only a display name is entered. `POST /v1/register {name}` returns `{token,profile}`. Store the opaque token ONLY in local device storage. Send `Authorization: Bearer <token>` on REST calls. A friend code is public and never grants account access. Clearing device storage loses access to this guest account. No password/email flow in v1.

`profile = {id,code,name,wins,played}`; `code` is a digit string rendered with a leading `#` in UI. Codes start with four digits and expand when required. `GET /v1/me -> {profile}`. `POST /v1/profile {name} -> {profile}` renames the account.

All success responses have `ok:true`; errors `{ok:false,reason}` with appropriate HTTP status. Safe reason strings are mapped to Turkish UI text. Do not display raw backend stack traces.

## Friends

`GET /v1/friends -> {friends:profile[],incoming:profile[],outgoing:profile[],invites:[{roomCode,from:profile,createdAt}]}`.

`POST /v1/friends/request {code}`; `POST /v1/friends/respond {userId,accept:boolean}`; `POST /v1/friends/remove {userId}`. Codes accept an optional leading #. The requested user must accept; sending a request is not a friendship. Self requests are rejected. Repeated requests are idempotent. No global user directory or private token data is exposed.

Optional `GET /ws/lobby?token=...` emits `{type:'social'}` when a friend request, acceptance or room invitation changes. Client then GETs the friend list. No periodic polling. Close this socket outside the lobby. The server may send `{type:'ready'}` on connect.

## Rooms

`POST /v1/rooms {}` -> `{roomCode}` (six uppercase characters). `POST /v1/rooms/CODE/join {}` -> `{roomCode}`. `POST /v1/rooms/CODE/invite {userId}` invites an accepted friend. Rooms expire; sharing the room code permits a second registered player to join, never a third. Host creates; both players ready by joining; host starts.

`GET /ws/rooms/CODE?token=...` is authenticated and requires membership from create/join. The server sends full public snapshots `{type:'state',state}` on connect and every meaningful event. Clients send `{type:'start'}`, `{type:'continue'}`, `{type:'chat',text,messageId,turnId}`, `{type:'leave'}`, or literal `ping` (reply `pong`). `messageId` is a fresh UUID; `turnId` is the latest observed turn. No per-second network traffic. Errors `{type:'error',reason}`. Client reconnects with backoff and same identity/room; refresh is safe. Each player may have one current room socket; replacing an old connection is supported. On disconnect, allow 30 seconds to return before forfeiting. A deliberate leave forfeits immediately once play/countdown begins.

`state = {roomCode,phase,roundNumber,roundResult,continueReady,winsToWin,maxRounds,players:[{id,name,code,score,connected}],activePlayerId,deadlineAt,serverNow,turnId,chain,activeIndex,messages,winnerId,endReason,lastCorrect}`.

`phase`: waiting/countdown/playing/round_end/finished. Countdown is 3 seconds. Playing turn is 30 seconds. Server controls time, order, correctness and scores. Wrong answers do not end the turn. Correct answers score 100 and switch players. Timeout switches players on the same word; two full timeouts on that word reveal it and advance with no score. Each five-word round is capped at four minutes. A series ends when either player has two round wins (2–0 or 2–1). At round_end, both players send continue before a new three-second countdown. A drawn round is replayed without awarding a round win. Highest score wins. Equal positive scores use the lowest total server-measured correct response time (`player.responseMs`, `tieBreak:"speed"`). Equal times or all-zero scores are a draw; `winnerId:null` on a draw. `endReason`: chain_complete/time_limit/forfeit/abandoned. Online score never mutates offline gold or progress.

`chain` has five cells. Revealed cells `{stem,answer,status:'solved'|'skipped'}`; hidden cells only `{first,length,status:'hidden'}`. No unrevealed stem/answer/definition/private level ID is returned. `lastCorrect={answer,stem,index,at,playerId,turnId}` is safe once revealed and lets clients briefly animate answer to stem. Future cells remain hidden.

`messages = [{id,playerId,name,text,kind,at,clientMessageId?}]`, capped to recent history. `kind`: chat/wrong/correct/system. Wrong single-word guesses by the active player get a red strike; correct inflected answers get a green check. Multiword conversation (e.g. 'naber lan') is neutral chat, Only the active player may send during play; all inactive-player messages are rejected with not_your_turn. Messages outside playing are rejected with not_playing. Text is plain text, max160 characters; render with textContent/escaping, never raw HTML. Chat is rate limited server-side. Duplicate IDs and old turn answers must never score twice. An old-turn message may be rejected with stale_turn; client keeps its draft and refreshes state.

## Configuration and lifecycle

Public non-secret config is `config/online.json = {"baseUrl":"https://sozcuk-zinciri-api-ardaisik.ardadc99.chatgpt.site"}`. This public Sites ingress forwards authenticated HTTP/WebSocket requests to the Cloudflare Worker. It has no account database. A shared server-only gateway key preserves client registration rate limits; that key is never included in client config. Empty URL means service is awaiting owner activation, not a fake offline multiplayer room. Web build embeds this small config; native loads the same resource. Tokens and private server state never enter git or the client bundle. Local development may use `http://127.0.0.1:8787` explicitly.

On leaving the online screen, remove listeners and timers, close sockets, and cancel reconnects. Save the room code until server reports finished/left. Use serverNow to estimate clock offset, render countdown locally, and request a fresh snapshot on reconnect. Resizing/typing must retain the chat input node and draft; do not rebuild the full screen on each clock tick.

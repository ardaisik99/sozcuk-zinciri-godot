# Sözcük Zinciri online protocol v3 (release v8)

The additions below supersede older v1/v2 rule descriptions further down. HTTP
paths keep their `/v1` prefix for existing installed clients. Persisted v2 rooms
finish under `legacy-match.mjs`; every newly created room uses version 3.

## Six questions, fair sudden death and answer review

Every normal round contains six questions. Six alternating correct answers give
each player three points (wire score remains `correct_count * 100`). Speed is
never a v3 tie-break. If the scores tie, play paired sudden-death questions: each
player receives one fresh question and a full 30-second turn. A first failure
does not end the round until the second player has had the same opportunity.
One success and one failure decides the round; two successes or two failures
start another pair. Two round wins still decide a 2–0/2–1 series.

During the first six questions, two timeouts on a question reveal it and advance
without awarding points. In sudden death, one timeout reveals that player's
question and passes to the other player's separate fresh question. There is no
response-time winner. If the account-specific unseen bank runs out, the server
returns `bank_exhausted` instead of repeating a question. An equal unfinished
round then remains drawn. Do not promise an unlimited bank.

`state.question = {prompt,first,length,revealed:[{index,letter}],hint,newChain}` is
the authoritative question header. Render `prompt → mask`; `newChain` marks a
new starting stem if the previous chain has no fresh outgoing pair. Do not infer
the prompt from a previous cell. `questionNumber`, `questionsPerRound:6`,
`suddenDeath` and `suddenPairNumber` are also provided. `review` is a list of
disclosed `{questionId,prompt,answer,stem,status,playerId,at,roundNumber}` records.
Show it on both round and match results, including the final winning answer and
questions both players failed. Queued future answers remain private.

Questions are identified by normalized `PROMPT|ANSWER`, not mutable bank IDs.
The Directory permanently remembers served pairs for each human account. New
questions exclude the union of both players' histories. Bots do not have a shared
global history. The one-time `LEGACY_QUESTION_IDS` secret conservatively excludes
the old bank for accounts that played before this release.

## Avatars, economy and match history

Register/profile accept `avatar:'mascot-boy'|'mascot-girl'`. Own profiles add
`gold`, `inventory:{hint,letter}`, `removeAds`. The server wallet starts at 100;
offline gold is a separate local save and cannot credit this wallet. A completed
series grants the winner 60 gold and the other player 30. Forfeits grant no gold.

`GET /v1/shop` returns `{ok,gold,inventory,removeAds,billingEnabled,products}`.
Gold products: `hint_pack_2` (25 gold), `letter_pack_4` (60 gold). Buy using
`POST /v1/shop/buy {productId,requestId}`. The idempotent response includes the
updated `profile`. Google-only product IDs are `hint_pack_10`, `letter_pack_25`,
`gold_500`, `gold_1500`, `remove_ads`. They remain disabled until the owner
configures billing. Removing ads additionally requires `ADS_ENABLED='true'`.

`POST /v1/purchases/google {productId,purchaseToken}` is authenticated. Google
verification is account bound. The verified receipt hash is granted exactly once
in SQLite before server consumption/acknowledgement. The response contains only
`{ok,profile,productId,consumable,acknowledged,ackPending,duplicate}`. No purchase
token is stored in Directory data or echoed. Never grant from a client callback.

WS `{type:'joker',kind:'hint'|'letter',turnId,requestId}` uses one owned consumable
first, otherwise charges 15/20 gold respectively. Per player, per entire match:
two hints and four letters. Only the active player may use them; letter reveals
are distinct and never count the already visible first letter. Hints/reveals are
visible to both players. Durable pending intents plus a unique debit ledger make
actor restarts/lost replies safe. `players[].jokers` exposes counters and limits.

`GET /v1/history` returns the newest 50 completed matches in `history`. Records
include `roomCode,opponent:{id,name,code,avatar,isBot},rounds,score:[self,other],
result:'win'|'loss'|'draw',finishedAt,review,endReason`. Private credentials and
undisclosed answers are never included. This history survives the 24-hour room
chat cleanup.

## Random matchmaking

`POST /v1/matchmaking/join {}`, `GET /v1/matchmaking`, and
`POST /v1/matchmaking/cancel {}` return
`{ok,status:'idle'|'waiting'|'matched',roomCode?,botAfterAt?}`. The lobby socket
also sends `{type:'matchmaking',...state}`. Two waiting humans are paired first;
after 12 seconds without another player, the server creates a visibly identified
`isBot:true` opponent. Bots use variable thinking delays, wrong guesses and
timeouts; they never masquerade as human accounts. A late cancellation returns
`matched` with the room code instead of orphaning the newly created match.
Random matches start automatically when both room sockets are connected; the
bot counts as connected. A human's intermission confirmation readies the bot too.

---

## Original transport reference (v1/v2 compatibility)

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

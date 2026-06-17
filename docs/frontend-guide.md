# Frontend Integration Guide

A prose guide for wiring a frontend to this backend. It is the **stitching
layer**: it explains how the three surfaces fit together — authentication, the
WebSocket connection, the stage machine, and the end-to-end play scenarios — so
that a frontend developer does not drown when connecting the pieces.

It deliberately does **not** re-document individual REST endpoints or the full
realtime event catalog. Those have a single source of truth each (see below);
this guide links to them rather than copying them.

---

## §0 · Table of contents & how to read this

1. [§1 Introduction & quick start](#1--introduction--quick-start)
2. [§2 Authentication](#2--authentication) ⭐
3. [§3 Stages](#3--stages) ⭐
4. [§4 Scenarios](#4--scenarios-rest--ws-end-to-end) ⭐
5. [§5 WebSocket](#5--websocket)
6. [§6 Files](#6--files)

**Three documents, three jobs — read them together:**

| Document | Covers | Use it for |
|---|---|---|
| **Swagger UI** (`/docs`) | The REST surface — every path, verb, body, response DTO, status codes | "What do I call, with what body, and what comes back?" |
| **`realtime-events.md`** | The WebSocket event catalog — every event name, direction, area, audience, and payload | "What event fires, who receives it, and what's in it?" |
| **This file** | The connection between them | "In what order do I call things, what auth do I attach, and what do I render per stage?" |

This guide **never duplicates** the endpoint list or the event catalog — it
**stitches** them: it tells you *which* call triggers *which* events, *who*
receives them, and *what* the client should do next. When you need the exact
request body or the exact payload shape, follow the link to Swagger or
`realtime-events.md`.

---

## §1 · Introduction & quick start

### What this is

A **wiring** guide, not a reference. It assumes you will keep Swagger (`/docs`)
and `realtime-events.md` open alongside it. Its job is to remove the "how do all
these pieces connect?" friction.

### Three surfaces, one process

The backend is a **single process on one origin and port** (default `:3000`).
REST and WebSocket share it.

| Surface | Base | Notes |
|---|---|---|
| REST API | `/api` | ⚠️ Every REST route is under the `/api` prefix (also reflected in the OpenAPI `paths`). |
| Swagger UI | `/docs` | Interactive REST reference; "Try it out" targets the `/api` base. |
| WebSocket | `/socket.io` | Socket.IO transport. One server, shared with REST. |

### CORS & environment

Two independent origins, both defaulting to `*` in dev:

| Variable | Default (dev) | Governs |
|---|---|---|
| `FRONTEND_ORIGIN` | `*` | CORS for the REST API. |
| `WS_CORS_ORIGIN` | `*` | CORS for the WebSocket. |
| `WS_PATH` | `/socket.io` | The Socket.IO path the client must match. |

Lock both origins down to your real frontend host before any shared/public
deployment.

### Error envelope

Every REST error (and the WS domain/transport error events) shares one shape:

```json
{
  "error": { "code": "ROOM_NOT_FOUND", "message": "Room not found.", "details": null },
  "timestamp": "2026-06-17T10:00:00.000Z",
  "path": "/api/rooms/ABCDEF"
}
```

`error.code` is a stable machine string; `error.message` is human text;
`error.details` is optional. The exact HTTP status per endpoint is in **Swagger**
— this guide and `realtime-events.md` describe *behaviour*, Swagger describes
*status codes*.

### 5-minute quick start

1. **Create a room** — `POST /api/rooms`. The reply carries `hostReconnectToken`.
   (A player instead does `POST /api/rooms/:code/players` and gets a
   `reconnectToken`.) → [§2.1](#21--the-two-tokens)
2. **Save the token.** It is issued **once** and never re-sent. Lose it and you
   lose your identity. → [§2.2](#22--tokens-are-issued-once--save-them)
3. **Open the socket** with the token in `auth.reconnectToken`. On success the
   backend auto-joins your room and pushes a state snapshot. → [§5.1](#51--connecting)
4. **Listen by area.** Subscribe to the event areas you render
   (lobby/gameplay/commerce/…). → [§5.4](#54--the-eight-event-areas-overview)
5. **Render by stage.** Drive your UI off `room.currentStage` and the
   `game-stage-changed` push. → [§3](#3--stages)

Everything below expands these five steps.

---

## §2 · Authentication

Authentication is **opaque-token based**. There is no login, no JWT, no session
cookie. Two tokens exist, and the entire identity model hangs off them.

### §2.1 · The two tokens

| | Host token | Player token |
|---|---|---|
| Issued by | `POST /api/rooms` | `POST /api/rooms/:code/players` |
| Response field | `hostReconnectToken` | `reconnectToken` |
| REST header | `X-Host-Token` | `X-Player-Token` |
| WS handshake | `auth.reconnectToken` | `auth.reconnectToken` |
| Form | Opaque random string (32 bytes, base64url) — **not** a JWT, nothing to decode | same |

Both tokens are the credential **and** the identity: the backend resolves *who
you are* by looking the token up, not by parsing it.

### §2.2 · Tokens are issued ONCE — save them

> **The token is returned exactly once, in the body of the create/join call. It
> is never re-issued.** The public read DTOs (`RoomResponseDto`,
> `PlayerResponseDto`) deliberately **strip** it, and the reconnect endpoints
> return a room snapshot **without** a fresh token. **If the client loses the
> token, that identity is gone** — there is no recovery endpoint.

Persist it immediately (e.g. `localStorage`) the moment you read the create/join
response. This is the single most common integration mistake; treat the token
like a password you can never reset.

### §2.3 · Transport — how the token rides each call

- **REST:** attach the header on every **guarded** route (the host actions, the
  player actions). Open reads (board, topics, public lists) need no header.

  ```js
  // Host-guarded REST call — attach X-Host-Token.
  await fetch(`${BASE}/api/rooms/${code}/game/start`, {
    method: 'POST',
    headers: { 'X-Host-Token': hostReconnectToken },
  });
  // A player-guarded call attaches { 'X-Player-Token': reconnectToken } instead.
  ```

- **WebSocket:** the token rides the handshake `auth.reconnectToken` (see
  [§5.1](#51--connecting)). You do not send it per-event.

### §2.4 · Reconnect

Reconnect re-attaches your existing identity; it never mints a new one — the
**same token is reused**.

- **HTTP reconnect** — `POST /api/rooms/:code/players/reconnect`
  (`X-Player-Token`) or `POST /api/rooms/:code/host/reconnect` (`X-Host-Token`).
  Both return a `RoomStateResponseDto` snapshot (`{ room, players[], teams[] }`)
  and **no** new token. One use case (`ReconnectClient`) backs both the HTTP and
  the WS paths.
- **WebSocket reconnect** — just open the socket with the token; the backend
  resolves you, joins your room, and replays the snapshot (see
  [§5.1](#51--connecting) / [§2.8](#28--invalid_reconnect_token)).

### §2.5 · The anonymous socket (spectator)

> A socket opened **without** a token is **not** an automatic spectator. It stays
> ungrouped — it sees **nothing**.

To watch a room, an anonymous socket **must explicitly** join with the
`client:realtime:join-room` command. That command is **not validated** — any
socket may join any room id. This is exactly *why* secrets are never broadcast
room-wide: the room channel is not a trust boundary (see
[§5.2](#52--audiences) and [§6](#6--files)). Host-only and team-only deliveries
do not ride the room channel for this reason.

### §2.6 · 401 vs 403 — who gets what

| Situation | Status |
|---|---|
| Player route, missing / malformed / unknown player token | **401** |
| Player route, valid token but **wrong room** or **wrong team** | **403** |
| Host route, **any** auth problem (missing / wrong token) | **403** (host routes never return 401) |
| Malformed room code (fails validation) | **400** |
| Well-formed but unknown room code | **404** |

The asymmetry is intentional: a player is *authenticated then authorised* (so
authn failures are 401, authz failures 403); a host is judged purely on the host
token, so every host-auth failure is a 403.

### §2.7 · The three guards

| Guard | Used by | Behaviour |
|---|---|---|
| `HostAuthGuard` | host actions | `X-Host-Token` must equal the room's host token. |
| `PlayerIdentityGuard` | player actions | Coarse **authentication** only — resolves the player from `X-Player-Token` and checks room membership. Fine-grained **authorisation** (is this player the captain? the active team?) lives **in the use case**, not the guard — so a non-captain passes the guard and is rejected by the domain. |
| `TeamMemberOrHostGuard` | team inventory reads | **Either/or.** A *present* `X-Host-Token` commits you to the host path (validated strictly, no silent downgrade); otherwise the `X-Player-Token` must belong to a player of **this** room **and** the `:teamId` in the path. |

### §2.8 · `INVALID_RECONNECT_TOKEN`

On the WS handshake the backend distinguishes two cases:

- **No token (missing or empty string):** the socket is silently left as an
  anonymous transport socket. No error, no disconnect. (It can still
  `join-room`; see [§2.5](#25--the-anonymous-socket-spectator).)
- **A non-empty token that fails to resolve:** the backend emits a single
  `server:game-session:error` with `code: 'INVALID_RECONNECT_TOKEN'` and then
  **force-disconnects** the socket.

So "I connected and got immediately disconnected with an error" means you sent a
**bad** token; "I connected but receive nothing" means you sent **no** token and
have not joined a room.

---

## §3 · Stages

Almost all client rendering is a function of the room's current stage. Get the
stage model right and the rest follows.

### §3.1 · The 12 stages, in canonical order

`LOBBY` → `TEAM_SETUP` → `READY_CHECK` → `GAME_BOARD` → `QUESTION_OPENED` →
`ANSWER_REVIEW` → `SHOP` → `PRESENTATION_PREPARATION` → `PRESENTATION_DEFENSE` →
`EVALUATION` → `RESULTS` → ~~`FINISHED`~~.

> **`FINISHED` is a rudiment as a *stage*.** It exists in the stage *type* but
> has no incoming transition in the stage-flow table, and the terminal stage is
> `RESULTS`. The frontend will **never** observe `currentStage: 'FINISHED'`.
> "Finished" is a room **status**, not a stage (see §3.2). Do not write code that
> waits for a `FINISHED` stage.

### §3.2 · Status vs stage — orthogonal

`room.status` and `room.currentStage` are independent axes:

- **`status`** ∈ `ACTIVE` | `FINISHED` | `CLOSED`.
  - `ACTIVE` — the normal playing state. **Every mutation requires `ACTIVE`.**
  - `FINISHED` — set by `markFinished` when results are calculated **on the
    `RESULTS` stage**. The game ran to completion.
  - `CLOSED` — set when the host aborts the room (`POST /api/rooms/:code/close`).
- **`stage`** — where in the 12-step flow the room is.

So a completed game ends as `status: FINISHED` **on** `stage: RESULTS` — never on
a `FINISHED` stage. A host abort flips `status` to `CLOSED` from whatever stage
it was on.

### §3.3 · Per-stage cheat sheet

| Stage | What to show | Actions (who) | Enters when → exits to |
|---|---|---|---|
| `LOBBY` | Room code, players arriving | Create / join a team (player) | Room created → `TEAM_SETUP` on the **first team created** |
| `TEAM_SETUP` | Teams forming, topic picks | Join team, select topic, set ready (captain) | First team created → `READY_CHECK` when **≥ `MIN_TEAMS_TO_START`** teams are ready |
| `READY_CHECK` | Ready teams, "host can start" | Toggle ready (captain); start game (host) | Threshold reached → `GAME_BOARD` when the **host starts** |
| `GAME_BOARD` | 6×5 board, the active team | Pick a cell (active-team captain); open/reject (host) | Game start, or return from review/shop → `QUESTION_OPENED` when the **host opens** |
| `QUESTION_OPENED` | Question text, countdown | Submit an answer (active-team captain); advance on timeout (host) | Host opened → `ANSWER_REVIEW` on **answer submit** or **timeout-advance** |
| `ANSWER_REVIEW` | The submitted answer, host verdict | Accept / reject (host) | Answer/timeout → **fork A**: `GAME_BOARD` or `SHOP` |
| `SHOP` | Catalog, team balances | Buy items (captain); close shop (host) | Fork A (every-6th block / exhausted board) → **fork B**: `GAME_BOARD` or `PRESENTATION_PREPARATION` |
| `PRESENTATION_PREPARATION` | Requirements, prep countdown, uploads | Start prep timer (host); upload file (captain) | Final shop closed (board exhausted) → `PRESENTATION_DEFENSE` when the **host starts defenses** |
| `PRESENTATION_DEFENSE` | Current presenter, the order | Finish / skip presenter (host) | Host started → **fork C**: next presenter, or `EVALUATION` when the queue is exhausted |
| `EVALUATION` | Criteria, progress (counts only) | Submit / confirm scores (captain & host) | Last defense finished → `RESULTS` when the **host posts results** |
| `RESULTS` | Final leaderboard | — (terminal) | Host calculated results → terminal; `status` becomes `FINISHED` in the same call |
| ~~`FINISHED`~~ | — | — | Rudiment — never observed as a stage (see §3.1) |

### §3.4 · Flow diagram (textual)

```
LOBBY → TEAM_SETUP → READY_CHECK → GAME_BOARD ⇄ QUESTION_OPENED → ANSWER_REVIEW
   │
   ├─ fork A   ANSWER_REVIEW ──→ GAME_BOARD               (normal: keep looping the board)
   │                         └─→ SHOP                     (every 6th blocked cell, or board exhausted)
   │
   ├─ fork B   SHOP ──→ GAME_BOARD                        (regular shop close)
   │                └─→ PRESENTATION_PREPARATION          (final shop: board exhausted)
   │
   ├─→ PRESENTATION_PREPARATION → PRESENTATION_DEFENSE
   │
   ├─ fork C   finish/skip ──→ next presenter             (finite queue — no wrap)
   │                       └─→ EVALUATION                 (after the last presenter)
   │
   └─→ EVALUATION → RESULTS                               (terminal — status becomes FINISHED here)
```

A linear backbone with **three branch points** (forks A, B, C — detailed below).

### §3.5 · The three forks

These are the only non-linear transitions. Each is decided **server-side** — the
client just reacts to the resulting `game-stage-changed` (and the area events).

- **Fork A — `ANSWER_REVIEW` → `GAME_BOARD` | `SHOP`.** After the host reviews an
  answer, the room enters the shop iff the board is exhausted **or** the blocked-
  question count is a multiple of 6 (`blockedQuestionsCount % 6 === 0`).
  - On a shop entry the review block ends with `shop-final-opened` if the board
    is exhausted, otherwise `shop-opened`.
  - Otherwise the room returns to `GAME_BOARD`.
  - The turn moves to the next team **either way** (even on a rejected answer).
- **Fork B — `SHOP` → `GAME_BOARD` | `PRESENTATION_PREPARATION`.** When the host
  closes the shop, a **regular** shop returns to `GAME_BOARD`; the **final** shop
  (board exhausted) moves on to `PRESENTATION_PREPARATION`. Closing emits
  `shop-closed` carrying `nextStage`.
- **Fork C — `PRESENTATION_DEFENSE` → next presenter | `EVALUATION`.** The
  defense queue is the participating teams in ascending `turnOrder`. It is
  **finite — it does not wrap**. When the host finishes/skips the last presenter
  there is no next team, which is exactly what drives `defense:finished`
  (`nextStage: EVALUATION`) and the exit.

### §3.6 · How the frontend learns the stage

Two complementary mechanisms:

- **Push** — subscribe to `server:game-session:game-stage-changed`
  (`{ roomId, stage }`), emitted room-wide on every transition.
- **Pull** — read `room.currentStage` from any room-state snapshot
  (`GET /api/rooms/:code/state`, the reconnect replies, or the WS
  `room-state` snapshot).

Use the pull on (re)connect to establish the current stage, then keep it live
with the push.

---

## §4 · Scenarios (REST → WS, end-to-end)

Each scenario lists the REST call you make and the WS events that arrive in
response, with their audience in brackets. All paths are `/api`-prefixed;
mutations are REST (there is no `client:*` mutation command — the only client→
server commands are the transport join/leave, [§5.3](#53--clientserver-commands)).
For exact bodies and response DTOs, see **Swagger**; for exact payloads, see
**`realtime-events.md`** at the cited §.

> **200 vs 201.** The *creating* POSTs return **201**: `POST /rooms`,
> `POST /rooms/:code/players`, `POST /rooms/:code/teams`,
> `POST /rooms/:code/teams/:teamId/members`. Every *game-action* POST returns
> **200** (game start, board/question moves, shop purchase/close, presentation,
> defense, evaluation, reconnect, room close). Plan your response handling
> accordingly.

### §4.1 · Lobby

1. `POST /api/rooms` → **201**, `hostReconnectToken`. *(host)*
2. `POST /api/rooms/:code/players` → **201**, `reconnectToken`; room-wide
   `player-joined`. *(each player)*
3. `POST /api/rooms/:code/teams` → **201**; room-wide `team-created`
   (the **first** team also fires `game-stage-changed` → `TEAM_SETUP`). *(captain)*
4. `POST /api/rooms/:code/teams/:teamId/members` → **201**; room-wide
   `team-joined` **and** `team-updated`. *(player)*
5. `PATCH /api/rooms/:code/teams/:teamId/topic` → **200**; room-wide
   `team-topic-selected`. *(captain)*
6. `PATCH /api/rooms/:code/teams/:teamId/ready` → **200**; room-wide
   `team-ready-changed` **and** `game-can-start-changed`. When the ready count
   reaches `MIN_TEAMS_TO_START`, also `game-stage-changed` → `READY_CHECK`.
   *(captain)*
7. `POST /api/rooms/:code/game/start` → **200**; room-wide `game-started`,
   `game-first-team-selected`, `game-stage-changed` (→ `GAME_BOARD`),
   `game-turn-changed`, `game-state-updated`. *(host)* → see [§4.2](#42--battle).

Catalog: `realtime-events.md` §16.1–§16.3.

### §4.2 · Battle

1. `POST /api/rooms/:code/board/select` → **200**; **host-only**
   `cell-selection-requested`. *(active-team captain)*
2. Host decides:
   - `POST /api/rooms/:code/questions/open` → **200**; room-wide
     `cell-selection-approved`, `question-opened` (**no** correct answer),
     `question-timer-started`. *(host)*
   - or `POST /api/rooms/:code/questions/reject` → **200**; room-wide
     `cell-selection-rejected`, `board-state-updated`; captain re-picks. *(host)*
3. `POST /api/rooms/:code/questions/answer` → **200**; **room-wide**
   `answer-submitted` — ⚠️ **this payload carries the answer text**
   (`{ roomId, cellId, teamId, answer }`) to the whole room. The text is not
   persisted; it is a live echo so every client can show what was said.
   *(active-team captain)*
4. `POST /api/rooms/:code/questions/review` → **200**; room-wide
   `answer-accepted` **or** `answer-rejected`, then (only on accept)
   `score-changed`, then `cell-blocked`, `game-turn-changed`,
   `board-state-updated`; on a shop entry (fork A) `shop-opened` /
   `shop-final-opened` last. If the host passed `revealAnswer: true`, a
   **host-only** `question-correct-answer-shown-to-host` also fires. *(host)*

**Timeout branch:** if the answer timer expires while still in
`QUESTION_OPENED`, the host calls `POST /api/rooms/:code/game/advance` → **200**;
room-wide `question-timer-ended`, moving the room to `ANSWER_REVIEW` (then review
as in step 4). There is no server scheduler — the client counts down to `endsAt`
locally and the host bridges the timeout.

Catalog: `realtime-events.md` §16.4.

### §4.3 · Shop

The shop is itself the destination of fork A — `shop-opened` /
`shop-final-opened` arrive **last** in the [§4.2](#42--battle) review block.

1. `GET /api/rooms/:code/shop/items` / `GET /api/rooms/:code/shop/round` — read
   the catalog and the round/timer. *(open)*
2. `POST /api/rooms/:code/shop/purchase` → **200**; room-wide `score-changed`
   (**negative** delta — only `balance` moves), `shop-item-purchased`,
   `shop-item-unavailable`, `shop-state-updated` (all **without** any QR
   content); then, **after commit**, a **team-only** `inventory-updated`
   carrying the QR `publicUrl`. *(captain, for their own team)*
3. `POST /api/rooms/:code/shop/close` → **200**; room-wide `shop-closed`
   (fork B → `GAME_BOARD` or `PRESENTATION_PREPARATION`). *(host)*

Catalog: `realtime-events.md` §16.5. Privacy: see [§6](#6--files).

### §4.4 · Presentation

1. `POST /api/rooms/:code/presentation/start-preparation` → **200**; room-wide
   `preparation-started` then `timer-started`. *(host)*
2. `POST /api/rooms/:code/presentation/upload` (multipart `file`) → **200**;
   after commit, room-wide `submission-uploaded`, then `submission-late` **iff**
   the upload was after the deadline, then `files-updated`. *(captain)*
3. `PUT /api/rooms/:code/presentation/upload` (replace) → **200**; room-wide
   `submission-replaced` then `files-updated`. (One upsert use case backs both
   verbs.) *(captain)*
4. Reads: `GET …/presentation/{requirements,deadline,submissions,files}`. *(open)*

Catalog: `realtime-events.md` §16.6. Files are **public** — see [§6](#6--files).

### §4.5 · Defense

1. `POST /api/rooms/:code/defense/start` → **200**; room-wide `defense:started`
   (carries the whole `order`) then `defense:team-started` (the first presenter).
   *(host)*
2. `POST /api/rooms/:code/defense/finish-presenter` (or `.../skip-presenter`) →
   **200**; room-wide `defense:team-finished` (or `defense:team-skipped`), then
   `defense:team-started` for the **next** presenter. *(host)*
3. On the **last** presenter, instead of `team-started` you get
   `defense:finished` (`nextStage: EVALUATION`) — fork C. *(host)*
4. `GET /api/rooms/:code/defense/state` — the derived state, for reconnect /
   refresh. *(open)*

Catalog: `realtime-events.md` §16.7.

### §4.6 · Evaluation & results

1. Reads: `GET …/evaluation/{criteria,teams,progress}` — `progress` is
   **counts only** (no numbers). *(open)*
2. `POST /api/rooms/:code/evaluation/team` *(captain)* or `.../evaluation/host`
   *(host)* → **200**; room-wide `score-submitted` then `progress-updated` —
   **neither carries a numeric score**. Your own numbers come back only in the
   POST reply.
3. `POST …/evaluation/team/confirm` / `.../host/confirm` → **200**; room-wide
   `score-confirmed` (one per frozen row) then `progress-updated`. Confirm is
   per-target, or all-at-once when you omit `targetTeamId`.
4. `POST /api/rooms/:code/evaluation/results` → **200**; **after commit**
   room-wide `completed` (stage `RESULTS`, status `FINISHED`) then
   `results-calculated` (the public leaderboard aggregates). *(host)*
5. `GET /api/rooms/:code/evaluation/results` — the leaderboard; works on a
   `FINISHED` room; individual evaluator scores stay private. *(open)*

Catalog: `realtime-events.md` §16.8.

### §4.7 · Reconnect

1. **HTTP** — `POST /api/rooms/:code/players/reconnect` *(player)* or
   `.../host/reconnect` *(host)* → **200**, a `RoomStateResponseDto` snapshot
   (no new token). → [§2.4](#24--reconnect)
2. **WebSocket** — open the socket with `auth.reconnectToken`. The **originating**
   socket receives `connection-restored` then `room-state`; the **room** is told
   via `client-reconnected` / `host-reconnected`.
3. **Drop** — when a player's **last** socket closes, the room gets
   `connection-lost`. A host drop is silent by design (the room outlives a host
   reload). Closing **one** tab of several fires nothing (multi-tab is presence-
   counted).

Catalog: `realtime-events.md` §16.1 and the §5.2b reconnect section.

---

## §5 · WebSocket

The catalog (`realtime-events.md`) is the source of truth for names, audiences
and payloads. This section covers **how to connect and reason about delivery** —
not a second copy of the catalog.

### §5.1 · Connecting

```js
import { io } from 'socket.io-client';

const socket = io(BACKEND_URL, {
  path: '/socket.io',            // must match WS_PATH
  transports: ['websocket'],
  auth: { reconnectToken },      // host OR player token; omit for an anonymous socket
});
```

- **With a token:** on success the backend resolves your identity, auto-joins
  your room, and sends `connection-restored` then a full `room-state` snapshot to
  your socket — that pair is your "join complete, here is the world" signal.
- **Without a token:** you connect as an anonymous socket and are joined to
  nothing; you must `client:realtime:join-room` to see a room
  ([§2.5](#25--the-anonymous-socket-spectator)).
- **Bad (non-empty) token:** a single `error` event then a forced disconnect
  ([§2.8](#28--invalid_reconnect_token)).

### §5.2 · Audiences

Delivery is the core concept. An event reaches one of four audiences:

| Audience | Mechanism | Who receives |
|---|---|---|
| **room-wide** | Socket.IO room channel | Everyone joined to the room (identified sockets auto-join; anonymous sockets that `join-room`). **Only non-secret events.** |
| **host-only** | Presence reverse-lookup (`h:<roomId>`), **not** a Socket.IO room | The host's live socket(s). Used for the host secrets — never a room channel (any socket could join one). |
| **team-only** | Presence lookup over the team roster | The live sockets of one team's members. |
| **originating** | The single source socket | Snapshots / errors returned to the caller (e.g. `room-state`, `connection-restored`). |

There is **no captain channel** — captain-targeted delivery uses the team
audience.

### §5.3 · Client→server commands

There are exactly **two**, both pure transport grouping with **no validation**:

| Command | Effect |
|---|---|
| `client:realtime:join-room` | Attach the socket to a room channel. No membership check — any socket, any room. |
| `client:realtime:leave-room` | Detach from the room channel. |

**Every game mutation is REST, not WebSocket.** The catalog lists `client:<area>:*`
command rows (create-team, submit-answer, purchase, …) — these are a *planned
forward path* and are **not implemented**. Do not try to mutate over the socket;
call the REST endpoint.

### §5.4 · The eight event areas (overview)

A map, not the catalog — for each area, the events you will most often wire and
where to find the payloads. **Follow the § link for the full list and shapes.**

| Area | Key events | Payloads |
|---|---|---|
| **Connection & reconnect** | `connection-restored`, `room-state`, `connection-lost`, `client/host-reconnected`, `error` | `realtime-events.md` §16.1 / §5.2b |
| **Lobby** | `player-joined`, `team-created/joined/updated`, `team-topic-selected`, `team-ready-changed`, `game-can-start-changed` | §16.2 / §5.2a |
| **Game start** | `game-started`, `game-first-team-selected`, `game-stage-changed`, `game-turn-changed`, `game-state-updated` | §16.3 / §5.2a |
| **Gameplay (battle)** | `board-state-updated`, `cell-selection-*`, `question-opened`, `question-timer-*`, `answer-submitted`, `answer-accepted/rejected`, `cell-blocked`, `score-changed` | §16.4 |
| **Commerce (shop)** | `shop-opened/final-opened/closed`, `shop-item-purchased`, `shop-item-unavailable`, `shop-state-updated`, `inventory-updated` | §16.5 |
| **Presentation** | `preparation-started`, `timer-started`, `submission-uploaded/replaced`, `submission-late`, `files-updated` | §16.6 |
| **Defense** | `defense:started`, `team-started`, `team-finished`, `team-skipped`, `finished` | §16.7 |
| **Evaluation & results** | `score-submitted`, `score-confirmed`, `progress-updated`, `completed`, `results-calculated` | §16.8 |

### §5.5 · Gotchas

- **Timestamps are ISO strings.** Server-side `Date` values (`startedAt`,
  `endsAt`, `uploadedAt`, …) are serialised to ISO-8601 **strings** over
  Socket.IO/JSON. Parse them; don't expect numbers.
- **Host-only events are invisible to players.** `cell-selection-requested` and
  `question-correct-answer-shown-to-host` go to the host socket only. A host
  client must subscribe to them; a player client will never see them and must not
  wait for them.
- **`score-changed` is one event for two directions.** A positive `delta` is an
  earn (answer accepted); a negative `delta` is a spend (shop purchase — only
  `balance` moves, `earnedScore` holds). Same event name, both cases.
- **`game-can-start-changed` is room-wide.** Although it conceptually targets the
  host, it is currently broadcast room-wide. Non-host clients may simply ignore
  it.
- **`team-updated` payload is not uniform.** Joining a team emits
  `{ roomId, team }`; leaving a team emits `{ roomId, teamId, team }`. Treat
  `teamId` as **optional** on this event and read the id from `team.id` when it's
  absent.
- **Reserved/superseded events never arrive.** These names exist in the catalog
  but are not emitted today, so do not wire handlers expecting them:
  `cell-selected`, `player-left`, `shop-purchase-rejected`,
  `requirements-updated`, `timer-ended`, `submission-status-changed`,
  `results-shown`. (Notably: a rejected purchase is the REST **409**, not a
  socket event; the various timers surface via their `GET` reads, never a pushed
  `timer-ended`.)

### §5.6 · Counts

As implemented today: **57** distinct server→client events are emitted, **7**
further catalog names are reserved/superseded (listed in
[§5.5](#55--gotchas) — defined but never sent), and **2** client→server commands
exist (`join-room`, `leave-room`). The catalog (`realtime-events.md`) is the
authoritative list.

---

## §6 · Files

Two file kinds, **opposite** privacy models. Do not copy one onto the other.

### How file links behave

`publicUrl` is a **direct, public** MinIO object URL — **not** a presigned,
time-limited link. Objects are stored with `Content-Disposition: attachment` and
a server-canonical `Content-Type`, so opening the URL **downloads** the file
rather than rendering it inline. In the UI, treat `publicUrl` as a **download
link**, not as something to embed (`<img>`/`<iframe>`).

### QR tools — secret (commerce)

A purchased QR tool belongs to the **buying team only**.

- Delivered over the **team-only** `inventory-updated` event (carries
  `publicUrl`) and the **team-gated** REST reads
  `GET /api/rooms/:code/inventory/teams/:teamId[/qr-tools]`
  (`TeamMemberOrHostGuard` — the team's own members or the host).
- **Never** room-wide. The room-wide commerce payloads
  (`shop-item-purchased`, `shop-state-updated`) deliberately omit all QR content
  — leaking it would hand every team the purchased advantage.

### Presentations — public

A team's presentation file is meant to be seen by the host **and** the other
teams.

- Delivered **room-wide**: `submission-uploaded` / `submission-replaced` and
  `files-updated` carry the `publicUrl`, and the open
  `GET /api/rooms/:code/presentation/files` returns the same projection.
- There is **no** team-gating here, by design. **Do not** apply the commerce
  secrecy pattern to presentations out of inertia — they have no secret to keep.

---

### Navigation

Read §0 → §6 in order on first integration. Cross-references throughout point to
**Swagger** (`/docs`) for REST request/response detail and to
**`realtime-events.md`** (§16.x) for WebSocket payloads. This file is the seam
between the two.

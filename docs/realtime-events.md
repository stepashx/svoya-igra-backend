# Realtime Event Contract

Transport: WebSocket (Socket.IO) sharing the single backend process/URL with
REST. The base gateway (`src/realtime/realtime.gateway.ts`) is **transport
only** — it groups sockets by room and broadcasts events published through
`RealtimeEventsPort`. It contains no business logic and validates no game state.

This document is the single place where realtime events are listed. It is
intentionally a **seam** right now: only the naming convention and the two
transport-level commands exist. Concrete feature events are added with their
stages (Game Session, Gameplay, Commerce, Presentation, Evaluation).

## Naming convention

Event names are direction-aware and area-scoped:

- `server:<area>:<event>` — server → client broadcast
- `client:<area>:<command>` — client → server command

`<area>` matches a compact feature area (`game-session`, `gameplay`,
`commerce`, `presentation`, `evaluation`, `realtime`). Build names with
`realtimeEventName(direction, area, name)` from
`src/realtime/realtime-events.constants.ts`.

## Audience

Audience is a **publishing** concern, not part of the event name. A future event
is delivered to the right recipients by emitting to the appropriate socket
group:

- **room-wide** — every socket joined to the room group
- **host-only** — the host socket(s)
- **team-only** — the sockets of one team
- **captain-only** — the captain socket
- **originating socket** — only the single source socket (e.g. a snapshot or an
  error returned to the caller)

## Transport-level commands (defined now)

| Event | Direction | Purpose |
|---|---|---|
| `client:realtime:join-room` | client → server | Join the socket to a room group. Transport grouping only — no membership validation. |
| `client:realtime:leave-room` | client → server | Leave the room group. |

## Reconnect (seam only)

A reconnect token may be supplied on the handshake (`auth.reconnectToken` or
query). The gateway reads it but does nothing with it yet — restoring host/player
identity and the state snapshot is the `ReconnectClient` use case (Stage 5B).

## Feature events

Game Session names (Lobby and Game start) and the Gameplay catalog (§16.4) are
below. Commerce, Presentation, and Evaluation rows are filled in as each feature
lands.

**Name contract only.** This catalog fixes the canonical name, direction, area,
and audience of each event. Payload schemas and the actual emission wiring are
**Stage 5.2** — nothing here implies an implementation. Audience is a publishing
concern (see the Audience section above), shown per row for reference.

### Game Session — server broadcasts (§16.1 Common)

| Canonical name | Direction | Area | Audience | Purpose | Plan ref |
|---|---|---|---|---|---|
| `server:game-session:room-state` | server | game-session | originating socket | Room-state snapshot on join/reconnect | §16.1 |
| `server:game-session:room-closed` | server | game-session | room | Room closed (status→CLOSED) | §16.1 |
| `server:realtime:error` | server | realtime | originating socket | Transport error while handling a command/state | §16.1 |
| `server:game-session:error` | server | game-session | originating socket | Domain lobby rejection (e.g. name taken, room full) | §16.1 |
| `server:game-session:client-reconnected` | server | game-session | room | Player restored identity; connection_status→CONNECTED | §16.1 |
| `server:game-session:host-reconnected` | server | game-session | room | Host restored identity and control | §16.1 |
| `server:realtime:connection-lost` | server | realtime | room | A member's socket dropped; marked DISCONNECTED | §16.1 |
| `server:realtime:connection-restored` | server | realtime | originating socket | Socket restored; triggers a room-state snapshot | §16.1 |

### Game Session — server broadcasts (§16.2 Lobby)

| Canonical name | Direction | Area | Audience | Purpose | Plan ref |
|---|---|---|---|---|---|
| `server:game-session:player-joined` | server | game-session | room | A player joined the room | §16.2 |
| `server:game-session:player-left` | server | game-session | room | A player left the room | §16.2 |
| `server:game-session:player-profile-updated` | server | game-session | room | A player changed name/avatar | §16.2 |
| `server:game-session:team-created` | server | game-session | room | Team created; the first team → stage TEAM_SETUP | §16.2 |
| `server:game-session:team-joined` | server | game-session | room | A player joined a team | §16.2 |
| `server:game-session:team-updated` | server | game-session | room | Team attributes changed (name/captain/roster) | §16.2 |
| `server:game-session:team-topic-selected` | server | game-session | room | Team selected a topic (teams.selectedTopicId, unique per room) | §16.2 |
| `server:game-session:team-ready-changed` | server | game-session | room | teams.isReady toggled; at ≥ MIN_TEAMS_TO_START ready → stage READY_CHECK | §16.2 |
| `server:game-session:game-can-start-changed` | server | game-session | host | "Host can start" flag: count of is_ready=true teams crosses MIN_TEAMS_TO_START | §16.2 |

### Game Session — server broadcasts (§16.3 Game start)

| Canonical name | Direction | Area | Audience | Purpose | Plan ref |
|---|---|---|---|---|---|
| `server:game-session:game-started` | server | game-session | room | Host started the game; stage→GAME_BOARD; backend assigns first team, random turn_order, random topics to teams that didn't pick | §16.3 |
| `server:game-session:game-first-team-selected` | server | game-session | room | First team chosen at random (rooms.currentTeamId) | §16.3 |
| `server:game-session:game-stage-changed` | server | game-session | room | rooms.currentStage transition (LOBBY→TEAM_SETUP→READY_CHECK→GAME_BOARD) | §16.3 |
| `server:game-session:game-turn-changed` | server | game-session | room | Active team changed (turn_order). Shared by §16.3 and §16.4 — not duplicated in gameplay | §16.3 |
| `server:game-session:game-state-updated` | server | game-session | room | Broad delta snapshot of game state (incl. auto-assigned topics at start) | §16.3 |

### Game Session — client commands

Incoming commands, area `game-session`. Audience does not apply to commands;
sender authorization does. **Emits** lists the resulting `server:game-session:*`
broadcasts by their short name. Payloads are Stage 5.2.

| Canonical name | Direction | Area | Purpose | Emits | Sender |
|---|---|---|---|---|---|
| `client:game-session:create-team` | client | game-session | Create a team | `team-created` (+ `game-stage-changed` on the first) | player/captain |
| `client:game-session:join-team` | client | game-session | Join a team | `team-joined`, `team-updated` | player |
| `client:game-session:leave-team` | client | game-session | Leave a team | `team-updated` | player |
| `client:game-session:update-profile` | client | game-session | Change name/avatar | `player-profile-updated` | player |
| `client:game-session:select-topic` | client | game-session | Select a topic | `team-topic-selected` | captain |
| `client:game-session:set-ready` | client | game-session | Toggle readiness | `team-ready-changed`, `game-can-start-changed` | captain |
| `client:game-session:start-game` | client | game-session | Start the game | `game-started`, `game-first-team-selected`, `game-stage-changed`, `game-turn-changed` | host |

### Plan name → canonical name (§16.1–16.3)

Canonical names are derived mechanically from the plan tokens: a plan token
`x:y` becomes `<direction>:<area>:x-y` in kebab-case, preserving the original
tokens (camelCase is split on case, e.g. `profileUpdated` → `profile-updated`).
The bare `error` (no `:`) maps to the transport area as `server:realtime:error`.
Area is assigned by concern: session/lobby domain → `game-session`; pure
transport (errors, connection lifecycle) → `realtime`.

| Plan name (§16) | Canonical name |
|---|---|
| `room:state` | `server:game-session:room-state` |
| `room:closed` | `server:game-session:room-closed` |
| `error` | `server:realtime:error` |
| `client:reconnected` | `server:game-session:client-reconnected` |
| `host:reconnected` | `server:game-session:host-reconnected` |
| `connection:lost` | `server:realtime:connection-lost` |
| `connection:restored` | `server:realtime:connection-restored` |
| `player:joined` | `server:game-session:player-joined` |
| `player:left` | `server:game-session:player-left` |
| `player:profileUpdated` | `server:game-session:player-profile-updated` |
| `team:created` | `server:game-session:team-created` |
| `team:joined` | `server:game-session:team-joined` |
| `team:updated` | `server:game-session:team-updated` |
| `team:topicSelected` | `server:game-session:team-topic-selected` |
| `team:readyChanged` | `server:game-session:team-ready-changed` |
| `game:canStartChanged` | `server:game-session:game-can-start-changed` |
| `game:started` | `server:game-session:game-started` |
| `game:firstTeamSelected` | `server:game-session:game-first-team-selected` |
| `game:stageChanged` | `server:game-session:game-stage-changed` |
| `game:turnChanged` | `server:game-session:game-turn-changed` |
| `game:stateUpdated` | `server:game-session:game-state-updated` |

The §16.1 `error` also yields a domain variant `server:game-session:error`
(lobby rejections such as name-taken / room-full). It has no separate plan
token — it refines the single plan `error` into transport vs. domain.

### Rooms & membership: REST vs. transport

- **CreateRoom / JoinRoom are REST**, not WS commands (§15.1 Rooms API, §15.2
  Players API). They issue identity and a reconnect token; no
  `client:game-session:*` command creates or joins a room.
- The transport commands `client:realtime:join-room` /
  `client:realtime:leave-room` already exist in
  `realtime-events.constants.ts`. They only attach/detach the socket to a room
  channel — they are **not** room membership.

### Gameplay — server broadcasts (§16.4)

Catalog of the §16.4 "board & questions" broadcasts. **Name contract only** —
payload schemas and emission wiring are **Stage 6.2**; nothing here implies an
implementation. The added **Status** column records each name's Stage-6
disposition (active in 6.2, reserved, or superseded). Audience is a publishing
concern (see the Audience section above), shown per row. See _Gameplay contract
notes_ below for the secrecy and timer constraints fixed now.

| Canonical name | Direction | Area | Audience | Purpose | Plan ref | Status |
|---|---|---|---|---|---|---|
| `server:gameplay:board-state-updated` | server | gameplay | room | Coarse snapshot of the board (6×5, categories, point values, taken cells) | §16.4 | Stage 6.2 (on entering GAME_BOARD + reconnect snapshot) |
| `server:gameplay:cell-selected` | server | gameplay | room | Captain's cell pick (room-wide pending highlight) | §16.4 | Superseded by cell-selection-requested — name reserved, NOT emitted in Stage 6 |
| `server:gameplay:cell-selection-requested` | server | gameplay | host | Active-team captain requested a cell; host is prompted to approve/reject | §16.4 | Stage 6.2 (SelectQuestion) |
| `server:gameplay:cell-selection-approved` | server | gameplay | room | Host approved → transition GAME_BOARD → QUESTION_OPENED | §16.4 | Stage 6.2 (OpenQuestion) |
| `server:gameplay:cell-selection-rejected` | server | gameplay | room | Host rejected → stays in GAME_BOARD, captain re-picks | §16.4 | Stage 6.2 (OpenQuestion/reject) |
| `server:gameplay:question-opened` | server | gameplay | room | Question revealed (text/points/category) — WITHOUT correctAnswer | §16.4 | Stage 6.2 (OpenQuestion) |
| `server:gameplay:question-timer-started` | server | gameplay | room | Answer timer started; carries endsAt (client counts down locally) | §16.4 | Stage 6.2 (OpenQuestion) |
| `server:gameplay:question-timer-ended` | server | gameplay | room | Answer timer expired (lazy ClockPort check, no server scheduler) → QUESTION_OPENED → ANSWER_REVIEW | §16.4 | Stage 6.2 |
| `server:gameplay:answer-submitted` | server | gameplay | room | Team submitted an answer (fact only; answer text payload TBD in 6.2 — possibly host-only) | §16.4 | Stage 6.2 (SubmitAnswer) |
| `server:gameplay:answer-accepted` | server | gameplay | room | Host accepted the answer — review outcome, NOT scoring | §16.4 | Stage 6.2 (ReviewAnswer) |
| `server:gameplay:answer-rejected` | server | gameplay | room | Host rejected the answer — review outcome, NOT scoring | §16.4 | Stage 6.2 (ReviewAnswer) |
| `server:gameplay:question-correct-answer-shown-to-host` | server | gameplay | host | Correct answer shown ONLY to host after the team answered | §16.4 | Stage 6.2 (ReviewAnswer) — HOST-ONLY, never to players (Этап2 §8) |
| `server:gameplay:cell-blocked` | server | gameplay | room | Cell blocked (on both correct and incorrect answers) | §16.4 | Stage 6.2 (ReviewAnswer) |
| `server:gameplay:score-changed` | server | gameplay | room | Team score changed | §16.4 | Stage 7.1 (ReviewAnswer) — emitted on accepted review only; payload `{ roomId, teamId, earnedScore, balance, delta }` |
| `server:game-session:game-turn-changed` | server | game-session | room | Active team changed | §16.4 → see game-session | Shared §16.3/§16.4 — not duplicated in gameplay (emitted by StartGame in 5.2a and by MoveToNextTurn in 6.2) |

### Gameplay — client commands (§16.4)

Incoming commands, area `gameplay`. Audience does not apply to commands; sender
authorization does. **Emits** lists the resulting broadcasts by their short
name; payloads are Stage 6.2. These rows are **forward-path** — not wired in
Stage 6; the live commands run over REST (§15.5–15.7). See _Gameplay contract
notes_ below.

| Canonical name | Direction | Area | Purpose | Emits | Sender |
|---|---|---|---|---|---|
| `client:gameplay:select-cell` | client | gameplay | Captain picks a cell (SelectQuestion) | `cell-selection-requested` | captain (active team) |
| `client:gameplay:approve-selection` | client | gameplay | Host approves (OpenQuestion) | `cell-selection-approved`, `question-opened`, `question-timer-started` | host |
| `client:gameplay:reject-selection` | client | gameplay | Host rejects the pick | `cell-selection-rejected` | host |
| `client:gameplay:submit-answer` | client | gameplay | Team submits an answer (SubmitAnswer) | `answer-submitted` | captain/team |
| `client:gameplay:review-answer` | client | gameplay | Host accepts/rejects (ReviewAnswer) | `answer-accepted` \| `answer-rejected`, `score-changed` (on accept), `cell-blocked`, `game-turn-changed` | host |
| `client:gameplay:reveal-correct-answer` | client | gameplay | Host requests the correct answer (§14.6 optional) | `question-correct-answer-shown-to-host` | host |

### Plan name → canonical name (§16.4)

Same derivation as §16.1–16.3: a plan token `x:y` becomes `server:gameplay:x-y`
in kebab-case (camelCase split on case, e.g. `stateUpdated` → `state-updated`,
`correctAnswerShownToHost` → `correct-answer-shown-to-host`). Two tokens are
special: `cell:selected` is reserved/superseded (see above) and `game:turnChanged`
keeps its existing `game-session` name — shared by §16.3/§16.4, not a second name.

| Plan name (§16.4) | Canonical name |
|---|---|
| `board:stateUpdated` | `server:gameplay:board-state-updated` |
| `cell:selected` | `server:gameplay:cell-selected` (reserved — superseded by `cell:selectionRequested`, not emitted in Stage 6) |
| `cell:selectionRequested` | `server:gameplay:cell-selection-requested` |
| `cell:selectionApproved` | `server:gameplay:cell-selection-approved` |
| `cell:selectionRejected` | `server:gameplay:cell-selection-rejected` |
| `question:opened` | `server:gameplay:question-opened` |
| `question:timerStarted` | `server:gameplay:question-timer-started` |
| `question:timerEnded` | `server:gameplay:question-timer-ended` |
| `answer:submitted` | `server:gameplay:answer-submitted` |
| `answer:accepted` | `server:gameplay:answer-accepted` |
| `answer:rejected` | `server:gameplay:answer-rejected` |
| `question:correctAnswerShownToHost` | `server:gameplay:question-correct-answer-shown-to-host` |
| `cell:blocked` | `server:gameplay:cell-blocked` |
| `score:changed` | `server:gameplay:score-changed` |
| `game:turnChanged` | `server:game-session:game-turn-changed` (see game-session; shared §16.3/§16.4 — not a second name) |

### Gameplay contract notes (§16.4)

- **Payloads & emission are Stage 6.2.** This section fixes only the
  name / direction / area / audience contract — no payload shape or emission
  wiring is implied.
- **Secrecy, fixed now.** `question-opened` goes to the **room without
  `correctAnswer`**; the correct answer reaches the host **only** via
  `question-correct-answer-shown-to-host` (host audience) and is never broadcast
  to players (Этап 2 §8).
- **Timer carries `endsAt`.** `question-timer-started` carries `endsAt`; the
  timer is stored as `startedAt` / `endsAt` / `status`, the client counts down
  locally, and expiry is a **lazy `ClockPort` check** with no server scheduler.
- **Battle-cycle mutations are REST.** The real mutations run over REST
  (§15.5–15.7 — SelectQuestion / OpenQuestion / SubmitAnswer / ReviewAnswer); the
  incoming `client:gameplay:*` commands above are the planned WS forward-path and
  are not implemented in Stage 6, exactly as `client:game-session:*` stayed
  forward-path in Stage 5.0.

## Stage 5.2a — what ships now

Sub-stage 5.2a implements the lobby over **REST** and emits the room-wide
broadcasts below from the use cases via `RealtimeEventsPort.emitToRoom`
(audience: room). The constants live in
`src/game-session/application/events/game-session-events.ts`.

**Incoming `client:game-session:*` commands are deferred (forward-path).** In
5.2a there are no WebSocket command handlers: every mutation (create/join room,
team actions, profile, start, close, reconnect) is a REST call. The
`client:game-session:*` rows above are the planned 5.2b WS forward-path and are
not wired yet. Host/team/captain-scoped delivery, the originating-socket
`room:state`/`error` snapshots, and the connection-lifecycle events
(`connection:lost/restored`, `client/host:reconnected` over the socket) are also
5.2b — 5.2a only emits room-wide.

### Room-wide event payloads (5.2a)

Shared projections (value objects unwrapped to primitives):

- **RoomSummary** = `{ id, code, status, currentStage, currentTeamId }`
- **PlayerSummary** = `{ id, roomId, teamId, name, avatar, isCaptain, connectionStatus }`
- **TeamSummary** = `{ id, roomId, name, captainPlayerId, selectedTopicId, isReady, turnOrder }`

| Canonical name | Payload |
|---|---|
| `server:game-session:player-joined` | `{ roomId, player: PlayerSummary }` |
| `server:game-session:player-profile-updated` | `{ roomId, player: PlayerSummary }` |
| `server:game-session:team-created` | `{ roomId, team: TeamSummary, captain: PlayerSummary }` |
| `server:game-session:team-joined` | `{ roomId, teamId, player: PlayerSummary }` |
| `server:game-session:team-updated` | `{ roomId, teamId, team: TeamSummary }` |
| `server:game-session:team-topic-selected` | `{ roomId, team: TeamSummary }` |
| `server:game-session:team-ready-changed` | `{ roomId, team: TeamSummary }` |
| `server:game-session:game-can-start-changed` | `{ roomId, canStart: boolean, readyCount: number }` |
| `server:game-session:room-closed` | `{ roomId, room: RoomSummary }` |
| `server:game-session:client-reconnected` | `{ roomId, player: PlayerSummary }` |
| `server:game-session:host-reconnected` | `{ roomId, hostId }` |
| `server:game-session:game-started` | `{ roomId, room: RoomSummary, teams: TeamSummary[] }` |
| `server:game-session:game-first-team-selected` | `{ roomId, currentTeamId }` |
| `server:game-session:game-stage-changed` | `{ roomId, stage }` |
| `server:game-session:game-turn-changed` | `{ roomId, currentTeamId }` |
| `server:game-session:game-state-updated` | `{ roomId, room: RoomSummary, teams: TeamSummary[] }` |

`game-can-start-changed` is a host-audience event in the catalog; in 5.2a it is
broadcast room-wide (no socket presence yet) and clients may ignore it.
`player-left` (room leave) is not emitted in 5.2a — leaving a *team* emits
`team-updated`.

## Stage 5.2b — WebSocket presence, reconnect & snapshot

Sub-stage 5.2b adds the socket side of reconnect on top of 5.2a. **Game
mutations stay REST** — there are still no incoming `client:game-session:*`
command handlers (see _forward-path_ below). What 5.2b ships:

- **Socket identity on the handshake.** A client opens the socket with
  `auth.reconnectToken` (or `?reconnectToken=`). The `GameSessionGateway`
  (`src/game-session/presentation/ws/`) resolves the principal — a player
  (`Player.findByReconnectToken` → `{ roomId, playerId }`) or the host
  (`Room.findByHostReconnectToken` → `{ roomId }`) — joins the socket to the
  room group, registers presence, and runs the existing `ReconnectClient` use
  case. A socket carrying **no** reconnect token (missing or empty) is **ignored**
  by this gateway — it stays an anonymous transport socket served by the base
  `RealtimeGateway` (it is never joined, never errored, never disconnected). Only
  a **non-empty** token that fails to resolve gets a single `error` then a forced
  disconnect.
- **Presence registry.** An in-memory map of live sockets per identity
  (multi-tab safe): a player is marked `DISCONNECTED` only when their **last**
  socket drops. See _Presence model_ below.
- **Originating-socket snapshot.** After a successful reconnect the gateway
  sends `connection-restored` then the full `room-state` snapshot to **that
  socket only** (`emitToClient`), while the room-wide `client-reconnected` /
  `host-reconnected` broadcast is emitted by `ReconnectClient` (unchanged from
  5.2a).

### Two gateways, one Socket.IO server

`GameSessionGateway` is a second `@WebSocketGateway()` (no namespace) that
attaches to the **same** Socket.IO server as the transport-only
`RealtimeGateway`. It never injects `@WebSocketServer()`: it groups sockets with
`client.join(roomId)` and publishes through `RealtimeEventsPort`
(`emitToClient` / `emitToRoom`), so the application layer stays transport-free.
The base `RealtimeGateway` remains pure transport.

### Who emits what

| Scope | Emitter | Via |
|---|---|---|
| room-wide lobby/game broadcasts | use cases (5.2a, unchanged) | `emitToRoom` |
| `client-reconnected` / `host-reconnected` (room) | `ReconnectClient` (unchanged) | `emitToRoom` |
| `connection-lost` (room) | `MarkClientDisconnectedUseCase` | `emitToRoom` |
| `connection-restored`, `room-state`, `error` (originating) | `GameSessionGateway` | `emitToClient(client.id, …)` |

### Originating-socket & connection payloads (5.2b)

`RoomStateResponseDto` is the same shape the REST room-state endpoints return
(`{ room, players[], teams[] }`).

| Canonical name | Area | Audience | Payload |
|---|---|---|---|
| `server:realtime:connection-lost` | realtime | room | `{ roomId, playerId }` |
| `server:realtime:connection-restored` | realtime | originating | `{ roomId, playerId: string \| null }` (`null` for the host) |
| `server:game-session:room-state` | game-session | originating | `RoomStateResponseDto` |
| `server:game-session:error` | game-session | originating | `{ code, message }` (an `AppError`, e.g. `INVALID_RECONNECT_TOKEN`) |
| `server:realtime:error` | realtime | originating | `{ code: 'INTERNAL_ERROR', message: 'Internal error' }` (non-`AppError`, secret-free) |

`client-reconnected` `{ roomId, player: PlayerSummary }` and `host-reconnected`
`{ roomId, hostId }` keep their 5.2a shape and room audience.

### Reconnect flow (handshake)

1. Read `auth.reconnectToken`/query (local `readReconnectToken` copy in
   `presentation/ws/handshake.ts`; the base gateway is untouched). **No token
   (missing or empty) → return immediately:** the socket is left untouched as an
   anonymous transport socket for the base `RealtimeGateway` (no join, no
   presence, no `error`, no disconnect).
2. Resolve the principal for the non-empty token. Player → `{ roomId, playerId }`;
   host → `{ roomId }`. A token that does **not** resolve (unknown / malformed /
   expired) → `emitToClient(server:game-session:error, { code:
   'INVALID_RECONNECT_TOKEN' })` then `client.disconnect(true)`.
3. `client.join(roomId)`; register the socket in the presence registry.
4. `ReconnectClient.execute({ roomId, principalHint, playerId? })` — the player
   branch marks the player `CONNECTED` and broadcasts `client-reconnected`
   room-wide; the host branch broadcasts `host-reconnected`. It **returns** the
   room snapshot.
5. The gateway sends `connection-restored` then `room-state` to the originating
   socket from the returned snapshot.

`handleConnection` is `async` and Nest does not await it, so its whole body runs
in `try/catch`: a thrown `AppError` becomes a `game-session:error`, anything
else a secret-free `realtime:error`.

### Disconnect

On `handleDisconnect` the gateway unregisters the socket from presence:

- **Host** — cleanup only. No event; the room stays alive (plan §14.1).
- **Player, last socket of that identity** — `MarkClientDisconnectedUseCase`
  marks the player `DISCONNECTED` and broadcasts `connection-lost` room-wide.
- **Player, another socket still open** — cleanup only (multi-tab).

### Presence model

The registry holds a forward map `socketId → entry` and a reverse map
`identityKey → Set<socketId>` (`identityKey`: player `p:<playerId>`, host
`h:<roomId>`). `markDisconnected` fires only when the **last** socket of an
identity leaves. It is **in-memory, per process** — correct for the single-node
MVP. Multi-node presence (a shared store / the Socket.IO Redis adapter) is
out of scope and deferred.

### Deliberate omissions (5.2b)

- **Forward-path `client:game-session:*` commands are not implemented.** Every
  game mutation stays REST; the command rows above remain the planned WS
  forward-path.
- **No host-disconnect event.** A host dropping is cleanup-only by design
  (§14.1) — the room must outlive a host reload.
- **No token TTL.** An expired token is simply "not found" and takes the same
  invalid-token path; TTL enforcement is post-MVP.
- **`game:canStartChanged` stays room-wide.** The host-socket mechanism now
  exists (`HostRealtimeEventsPort.emitToHost`, Stage 6.2b below), but narrowing
  this lobby event to the host audience remains deferred.

## Stage 6.2b — host-socket delivery

Sub-stage 6.2b implements the **host audience** for the two §16.4 host rows:
`cell-selection-requested` (now host-only, no longer room-wide) and
`question-correct-answer-shown-to-host` (new emission). The battle use cases
publish them through a dedicated application port,
`HostRealtimeEventsPort.emitToHost(roomId, event, payload)`
(`src/game-session/application/ports/`); the core `RealtimeEventsPort` is
untouched.

- **Mechanism: presence reverse-lookup, not a transport group.** The
  `PresenceHostRealtimeEventsAdapter` (`presentation/ws/`) resolves the host's
  live sockets via the 5.2b presence registry (`h:<roomId>` identity, every
  open host tab) and emits to each with `emitToClient`. A Socket.IO "host
  group" was deliberately rejected: the base gateway's public
  `client:realtime:join-room` would let any socket join it and read host
  secrets.
- **Reveal gating.** `question-correct-answer-shown-to-host`
  (`{ roomId, cellId, correctAnswer }`) is emitted by ReviewAnswer **only when
  the request carries `revealAnswer: true`**. It is an addition to REST —
  `current/host` / `current/answer` (HostAuthGuard) remain the source of
  truth; the room-wide payloads still never contain `correctAnswer`.
- **No-op without host sockets.** With no live host socket the emission simply
  addresses nobody; the REST mutation succeeds unchanged.
- **Single-node.** Presence is in-memory per process (see _Presence model_
  above), so host delivery shares the same single-node MVP scope.

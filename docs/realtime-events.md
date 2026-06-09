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

Game Session names (Lobby and Game start) are catalogued below. Gameplay,
Commerce, Presentation, and Evaluation rows are filled in as each feature lands.

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

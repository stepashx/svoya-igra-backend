# Realtime Event Contract

Transport: WebSocket (Socket.IO) sharing the single backend process/URL with
REST. The base gateway (`src/realtime/realtime.gateway.ts`) is **transport
only** — it groups sockets by room and broadcasts events published through
`RealtimeEventsPort`. It contains no business logic and validates no game state.

This document is the single place where realtime events are listed. The full
surface is **live**: events are really emitted across the eight feature areas
below (§16.1–§16.8), each with its payload documented. The base gateway stays
transport-only; socket identity, reconnect and the host/team audiences are
layered on by the game-session gateway and the application use cases (see
§5.2a / §5.2b and each area's Status column).

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

## Reconnect

A reconnect token may be supplied on the handshake (`auth.reconnectToken` or
query). The `GameSessionGateway` resolves it — player first, then host — joins
the socket to its room, runs the `ReconnectClient` use case, and returns
`connection-restored` + the `room-state` snapshot to the originating socket. A
missing/empty token leaves the socket anonymous (served by the base gateway
only); a non-empty token that fails to resolve gets a single `error` then a
forced disconnect. The full step-by-step is _Reconnect flow (handshake)_ under
§5.2b.

## Feature events

The eight catalogs below cover the whole surface: Game Session common (§16.1),
Lobby (§16.2), Game start (§16.3), Gameplay (§16.4), Commerce (§16.5),
Presentation (§16.6), Defense (§16.7) and Evaluation (§16.8).

**Names, audiences and payloads.** Each catalog fixes the canonical name,
direction, area and audience of every event. Payloads are documented too — the
§16.1–§16.3 shapes under §5.2a / §5.2b, and the §16.4–§16.8 shapes inline in each
area's Status column. Audience is a publishing concern (see the Audience section
above), shown per row.

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
| `server:game-session:game-can-start-changed` | server | game-session | room | "Host can start" flag: count of is_ready=true teams crosses MIN_TEAMS_TO_START. Catalog target is host; currently emitted **room-wide** (`MarkTeamReadyUseCase.emitToRoom`), narrowing to the host audience deferred (§5.2b omissions) — non-host clients may ignore it | §16.2 |

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

Catalog of the §16.4 "board & questions" broadcasts, emitted by the game-session
battle use cases since sub-stage 6.2 (6.2a wired the room-wide rows; 6.2b the two
host rows). The **Status** column records each name's disposition **and its
payload**. Audience is a publishing concern (see the Audience section above),
shown per row. Two shared projections appear in the payloads:

- **BoardCell** = `{ id, categoryId, points, position, state, openedByTeamId, answeredByTeamId }`
- **RoomQuestion** = `{ id, categoryId, points, position, text }` — **no `correctAnswer`**

See _Gameplay contract notes_ below for the secrecy and timer constraints.

| Canonical name | Direction | Area | Audience | Purpose | Plan ref | Status |
|---|---|---|---|---|---|---|
| `server:gameplay:board-state-updated` | server | gameplay | room | Coarse snapshot of the board (6×5, categories, point values, taken cells) | §16.4 | Emitted since 6.2a by OpenQuestion / RejectSelection / ReviewAnswer (board snapshot after a move); payload `{ roomId, cells: BoardCell[] }` |
| `server:gameplay:cell-selected` | server | gameplay | room | Captain's cell pick (room-wide pending highlight) | §16.4 | **Superseded** by cell-selection-requested — name reserved, no constant defined, NEVER emitted |
| `server:gameplay:cell-selection-requested` | server | gameplay | host | Active-team captain requested a cell; host is prompted to approve/reject | §16.4 | Emitted since 6.2b by SelectQuestionUseCase (captain `POST board/select`), host audience via `HostRealtimeEventsPort`; payload `{ roomId, cell: BoardCell }` |
| `server:gameplay:cell-selection-approved` | server | gameplay | room | Host approved → transition GAME_BOARD → QUESTION_OPENED | §16.4 | Emitted since 6.2a by OpenQuestionUseCase (host `POST questions/open`); payload `{ roomId, cell: BoardCell }` |
| `server:gameplay:cell-selection-rejected` | server | gameplay | room | Host rejected → stays in GAME_BOARD, captain re-picks | §16.4 | Emitted since 6.2a by RejectSelectionUseCase (host `POST questions/reject`); payload `{ roomId, cell: BoardCell }` (followed by a `board-state-updated`) |
| `server:gameplay:question-opened` | server | gameplay | room | Question revealed (text/points/category) — WITHOUT correctAnswer | §16.4 | Emitted since 6.2a by OpenQuestionUseCase; payload `{ roomId, cellId, question: RoomQuestion }` — `question` carries **no `correctAnswer`** |
| `server:gameplay:question-timer-started` | server | gameplay | room | Answer timer started; carries endsAt (client counts down locally) | §16.4 | Emitted since 6.2a by OpenQuestionUseCase; payload `{ roomId, cellId, startedAt, endsAt }` (Date → ISO strings on the wire) |
| `server:gameplay:question-timer-ended` | server | gameplay | room | Answer timer expired (lazy ClockPort check, no server scheduler) → QUESTION_OPENED → ANSWER_REVIEW | §16.4 | Emitted since 6.2a by AdvanceOnTimeoutUseCase (host `POST game/advance` timeout bridge); payload `{ roomId, cellId: string \| null }` |
| `server:gameplay:answer-submitted` | server | gameplay | room | Team submitted an answer — CARRIES the answer text room-wide | §16.4 | Emitted since 6.2a by SubmitAnswerUseCase (captain `POST questions/answer`), **room-wide**; payload `{ roomId, cellId, teamId, answer: string \| null }` — the `answer` TEXT is broadcast to the whole room (NOT persisted; a live echo) |
| `server:gameplay:answer-accepted` | server | gameplay | room | Host accepted the answer — review outcome, NOT scoring | §16.4 | Emitted since 6.2a by ReviewAnswerUseCase (host `POST questions/review`) on accept; payload `{ roomId, cellId, teamId: string \| null }` (`teamId` = the opening team) |
| `server:gameplay:answer-rejected` | server | gameplay | room | Host rejected the answer — review outcome, NOT scoring | §16.4 | Emitted since 6.2a by ReviewAnswerUseCase on reject; SAME emit position/shape as `answer-accepted` (the accept flag picks the name); payload `{ roomId, cellId, teamId: string \| null }` |
| `server:gameplay:question-correct-answer-shown-to-host` | server | gameplay | host | Correct answer shown ONLY to host after the team answered | §16.4 | Emitted since 6.2b by ReviewAnswerUseCase **only when `revealAnswer: true`**, host audience; payload `{ roomId, cellId, correctAnswer }` — never in a room-wide payload (Этап2 §8) |
| `server:gameplay:cell-blocked` | server | gameplay | room | Cell blocked (on both correct and incorrect answers) | §16.4 | Emitted since 6.2a by ReviewAnswerUseCase (both outcomes); payload `{ roomId, cellId, state, answeredByTeamId: string \| null }` (`state` = BLOCKED; `answeredByTeamId` null on reject) |
| `server:gameplay:score-changed` | server | gameplay | room | Team score changed | §16.4 | Emitted since 7.1 by ReviewAnswerUseCase (accepted review, POSITIVE `delta`); ALSO since 8.3 by PurchaseItemUseCase on a shop debit, NEGATIVE `delta` (only `balance` moves, `earnedScore` holds); payload `{ roomId, teamId, earnedScore, balance, delta }` |
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

- **Payloads & emission are live since Stage 6.2** (6.2a wired the room-wide
  rows; 6.2b the two host rows). Each event's payload is in the Status column
  above; the shared `BoardCell` / `RoomQuestion` projections are defined in this
  section's intro. The room-wide payloads never carry `correctAnswer`.
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

### Commerce — server broadcasts (§16.5)

Catalog of the §16.5 "shop & inventory" broadcasts. The constants live in
`src/game-session/application/events/commerce-events.ts` (next to the
game-session use cases that emit them, Design A). The shop lifecycle trio —
`shop-opened`, `shop-final-opened`, `shop-closed` — is **emitted since
sub-stage 8.2** (ReviewAnswerUseCase opens the shop, CloseShopUseCase closes
it); the purchase chain — `shop-state-updated`, `shop-item-purchased`,
`shop-item-unavailable` (room) and `inventory-updated` (team) — is **emitted
since sub-stage 8.3** (PurchaseItemUseCase). `shop-purchase-rejected` is
**superseded** (REST-only 409; no captain emitter built). The **Status**
column records each name's disposition. Audience is a publishing concern (see
the Audience section above), shown per row. See _Commerce contract notes_
below for the privacy constraint enforced throughout.

| Canonical name | Direction | Area | Audience | Purpose | Plan ref | Status |
|---|---|---|---|---|---|---|
| `server:commerce:shop-opened` | server | commerce | room | Shop opened (ANSWER_REVIEW → SHOP, every-6th-question cadence) | §16.5 | Emitted since 8.2 by ReviewAnswerUseCase (shop trigger) |
| `server:commerce:shop-final-opened` | server | commerce | room | Final shop opened (board exhausted, before presentations) | §16.5 | Emitted since 8.2 by ReviewAnswerUseCase (shop trigger, exhausted board) |
| `server:commerce:shop-state-updated` | server | commerce | room | Coarse snapshot of the shop (catalog + purchased state) — WITHOUT publicUrl/QR content | §16.5 | Emitted since 8.3 by PurchaseItemUseCase; payload `{ roomId, items: [{ id, title, description, price, qrToolId, available }] }` (in-tx, LAST of the room block) |
| `server:commerce:shop-item-purchased` | server | commerce | room | A team bought an item (item + buying team; price snapshot) — WITHOUT publicUrl/QR content | §16.5 | Emitted since 8.3 by PurchaseItemUseCase; payload `{ roomId, teamId, shopItemId, price, purchasedAt }` |
| `server:commerce:shop-item-unavailable` | server | commerce | room | An item became unavailable (purchased by another team, §14.8) | §16.5 | Emitted since 8.3 by PurchaseItemUseCase; payload `{ roomId, shopItemId }` |
| `server:commerce:shop-purchase-rejected` | server | commerce | captain | The captain's purchase was rejected (insufficient balance / already purchased) | §16.5 | **Superseded** — REST-only: the rejection is the POST-purchase 409 error reply (no captain socket emitter built) |
| `server:commerce:inventory-updated` | server | commerce | team | The team's inventory gained the bought QR tool (publicUrl allowed HERE — team audience) | §16.5 | Emitted since 8.3 by PurchaseItemUseCase, team-audience, AFTER commit; payload `{ roomId, teamId, inventoryItem: { id, shopItemId, qrToolId, addedAt }, qrTool: { id, title, description, fileFormat, publicUrl } }` |
| `server:commerce:shop-closed` | server | commerce | room | Shop closed (host action or shop timer) → back to GAME_BOARD or on to presentations | §16.5 | Emitted since 8.2 by CloseShopUseCase |

### Commerce — client commands (§16.5)

Incoming commands, area `commerce`. **Forward-path only** — not wired in Stage
8; the live mutations run over REST (§15.8 purchase/close), exactly as the
gameplay and game-session commands stayed forward-path in their stages.

| Canonical name | Direction | Area | Purpose | Emits | Sender |
|---|---|---|---|---|---|
| `client:commerce:purchase-item` | client | commerce | Captain buys a shop item (Purchase) | `shop-item-purchased`, `shop-item-unavailable`, `shop-state-updated`, `inventory-updated` \| `shop-purchase-rejected` | captain |
| `client:commerce:close-shop` | client | commerce | Host closes the shop (CloseShop) | `shop-closed` | host |

### Plan name → canonical name (§16.5)

Same derivation as §16.1–16.4: a plan token `x:y` becomes `server:commerce:x-y`
in kebab-case (camelCase split on case, e.g. `finalOpened` → `final-opened`,
`itemPurchased` → `item-purchased`).

| Plan name (§16.5) | Canonical name |
|---|---|
| `shop:opened` | `server:commerce:shop-opened` |
| `shop:finalOpened` | `server:commerce:shop-final-opened` |
| `shop:stateUpdated` | `server:commerce:shop-state-updated` |
| `shop:itemPurchased` | `server:commerce:shop-item-purchased` |
| `shop:itemUnavailable` | `server:commerce:shop-item-unavailable` |
| `shop:purchaseRejected` | `server:commerce:shop-purchase-rejected` |
| `inventory:updated` | `server:commerce:inventory-updated` |
| `shop:closed` | `server:commerce:shop-closed` |

### Commerce contract notes (§16.5)

- **The full §16.5 surface is live as of 8.3.** Sub-stage 8.1 fixed the name /
  direction / area / audience contract; 8.2 wired the lifecycle — `shop-opened`
  / `shop-final-opened` fire room-wide LAST in the ReviewAnswerUseCase broadcast
  block (payload `{roomId, currentShopRound, startedAt, endsAt, minClosableAt}`)
  and `shop-closed` fires from CloseShopUseCase (payload
  `{roomId, currentShopRound, nextStage}`). Sub-stage 8.3 wires the purchase
  chain in PurchaseItemUseCase: room-wide `score-changed` (negative delta) →
  `shop-item-purchased` → `shop-item-unavailable` → `shop-state-updated` fire
  IN-transaction; then the team-audience `inventory-updated` fires AFTER commit
  (see the privacy note below). `shop-purchase-rejected` was not built — the
  captain's rejection is the POST-purchase 409 reply.
- **QR privacy, fixed now.** The QR tool belongs to the buying team. Room-wide
  payloads — `shop-item-purchased` and `shop-state-updated` in particular —
  must NEVER carry `publicUrl` or any QR content; the tool reaches its owners
  only through the team-audience `inventory-updated` and the team-gated
  inventory REST reads (§15.9). Leaking a QR to the room would hand every team
  the purchased advantage (the §16.4 `correctAnswer` secrecy precedent).
- **"Unavailable" is purchased-state, not affordability.** `shop-item-unavailable`
  is room-global purchased-state (§14.8: an item is unique per game).
  Affordability is computed client-side from team balances (Этап 2 §10) — the
  server does not broadcast per-team affordability.
- **`inventory-updated` is emitted AFTER the purchase transaction commits.**
  This is the one deliberate exception to "emit inside the transaction": it is
  the only payload carrying the QR `publicUrl`, so were it sent in-transaction
  and the COMMIT then failed, the team would hold a QR for a rolled-back buy.
  The room-wide events stay in-transaction (their rollback risk is a stale
  purchased-state, not a leaked secret). The team fan-out reads from in-memory
  objects and swallows its own failures, so it cannot abort the committed buy.
- **Team delivery now exists; the captain rejection stays REST-only.** Stage
  8.3 added the `TeamRealtimeEventsPort` and `PresenceTeamRealtimeEventsAdapter`
  (the 6.2b host pattern, mirrored): it resolves the team roster from the player
  repository and fans out to each member's live sockets via
  `LobbyPresenceRegistry.socketsForPlayer('p:<playerId>')`. No captain emitter
  was built — `shop-purchase-rejected` is superseded by the POST-purchase 409.
- **Inventory reconnect is a guarded REST read.** A reconnecting client re-reads
  `GET rooms/:code/inventory/teams/:teamId[/qr-tools]` (the GET-board reconnect
  precedent), gated by the `TeamMemberOrHostGuard` (team members or host). The
  `publicUrl` is allowed on these reads — gated to its owners — but never in a
  room-wide payload.
- **§19 QR-item uniqueness is transitive — no explicit index (decision G).** The
  plan's `inventory_items (room_id, qr_tool_id)` unique index is deliberately
  NOT added in 8.3. A duplicate `(room, qrTool)` is impossible transitively:
  `purchases (room_id, shop_item_id)` is UNIQUE, shop↔QR is 1:1, and the single
  `inventory.create` lives inside the same purchase transaction guarded by that
  unique index. So `db:generate` stays "No schema changes". (If a future stage
  decouples shop items from QR tools, revisit and add the index.)
- **Team-hopping during SHOP is a known MVP risk (decision L).** `Join`/`Leave`
  team are not stage-gated, so during SHOP a non-captain could move into another
  team via the direct API, read its inventory/QR, and move back. The
  `TeamMemberOrHostGuard` is correct for the membership it sees; the fix —
  gating Join/LeaveTeam to the LOBBY stage — is tracked as a separate Stage 5
  task and intentionally out of 8.3 scope.

### Presentation — server broadcasts (§16.6)

Catalog of the §16.6 "presentation preparation" broadcasts. The constants live
in `src/game-session/application/events/presentation-events.ts` (next to the
game-session use cases that emit them, Design A). Sub-stage 9.1 fixed the name /
direction / area / audience contract only (no emission); sub-stage 9.2 wired the
preparation pair (`preparation-started` + `timer-started` from
`StartPresentationPreparationUseCase`); **sub-stage 9.3 completes the chain** —
`submission-uploaded` / `submission-replaced`, `submission-late`, and
`files-updated` fire from `UploadPresentationUseCase`. The **Status** column
records each name's disposition. Every row is **room-wide** (see _Presentation
contract notes_ for why there is no secrecy here).

| Canonical name | Direction | Area | Audience | Purpose | Plan ref | Status |
|---|---|---|---|---|---|---|
| `server:presentation:preparation-started` | server | presentation | room | Preparation opened (the room is already in PRESENTATION_PREPARATION) | §16.6 | Emitted since 9.2 by StartPresentationPreparationUseCase (host `POST start-preparation`), FIRST of the pair; payload `{ roomId, stage }` (`stage` = PRESENTATION_PREPARATION) |
| `server:presentation:requirements-updated` | server | presentation | room | Requirements catalog shown/updated for preparation | §16.6 | Reserved — the requirements catalog is static (seed-managed): read via `GET requirements`, never pushed (no emitter planned) |
| `server:presentation:timer-started` | server | presentation | room | Preparation timer started (deadline/endsAt set) | §16.6 | Emitted since 9.2 by StartPresentationPreparationUseCase, right AFTER `preparation-started`; payload `{ roomId, startedAt, endsAt }`. A repeat start REPLACES the timer and re-emits both |
| `server:presentation:timer-ended` | server | presentation | room | Preparation timer elapsed | §16.6 | Reserved — no server scheduler; the EXPIRED deadline surfaces lazily via `GET deadline` (the §16.4 answer-timer precedent), never pushed |
| `server:presentation:submission-uploaded` | server | presentation | room | A team uploaded its presentation file (publicUrl allowed — file is public) | §16.6 | Emitted since 9.3 by UploadPresentationUseCase (captain `POST upload`), AFTER commit, FIRST of the chain; payload `{ roomId, teamId, submission: { id, originalFileName, mimeType, fileSize, status, isLate, uploadedAt, publicUrl } }`. `mimeType` is the SERVER-canonical MIME from the extension (never the client type, B2) |
| `server:presentation:submission-replaced` | server | presentation | room | A team replaced its presentation file | §16.6 | Emitted since 9.3 by UploadPresentationUseCase (captain `PUT upload`, or `POST` over an existing row — ONE upsert use case), AFTER commit; SAME payload as `submission-uploaded`. The submission id and storage key are REUSED (overwrite in place; same-extension re-uploads leave no orphan) |
| `server:presentation:submission-late` | server | presentation | room | An upload landed after the deadline (status LATE, late penalty applies) | §16.6 | Emitted since 9.3 by UploadPresentationUseCase AFTER commit, ONLY when the upload was late (`isLate`); payload `{ roomId, teamId, submissionId, latePenalty }`. `latePenalty` = the EFFECTIVE penalty (the configured `LATE_PENALTY`, default 1; see note) |
| `server:presentation:submission-status-changed` | server | presentation | room | A submission's status changed (UPLOADED ⟷ LATE bookkeeping) | §16.6 | **Superseded** (never emitted) — the status is fixed once at create and a replace is a fresh create, so there is no UPLOADED⟷LATE transition to announce. The constant is retained for the §16.6 catalog, exactly like the unemitted `shop-purchase-rejected` (§16.5) |
| `server:presentation:files-updated` | server | presentation | room | The room's presentation file list changed (public links) | §16.6 | Emitted since 9.3 by UploadPresentationUseCase AFTER commit, LAST of the chain; payload `{ roomId, files: [{ teamId, originalFileName, mimeType, fileSize, publicUrl, status, isLate, uploadedAt }] }` — the whole room catalog, the SAME projection as `GET files` |

### Plan name → canonical name (§16.6)

Same derivation as §16.1–16.5: a plan token `x:y` becomes
`server:presentation:x-y` in kebab-case (camelCase split on case, e.g.
`preparationStarted` → `preparation-started`, `submissionStatusChanged` →
`submission-status-changed`).

| Plan name (§16.6) | Canonical name |
|---|---|
| `presentation:preparationStarted` | `server:presentation:preparation-started` |
| `presentation:requirementsUpdated` | `server:presentation:requirements-updated` |
| `presentation:timerStarted` | `server:presentation:timer-started` |
| `presentation:timerEnded` | `server:presentation:timer-ended` |
| `presentation:submissionUploaded` | `server:presentation:submission-uploaded` |
| `presentation:submissionReplaced` | `server:presentation:submission-replaced` |
| `presentation:submissionLate` | `server:presentation:submission-late` |
| `presentation:submissionStatusChanged` | `server:presentation:submission-status-changed` |
| `presentation:filesUpdated` | `server:presentation:files-updated` |

### Presentation contract notes (§16.6)

- **Presentation files are PUBLIC — the deliberate OPPOSITE of the §16.5 QR
  secrecy.** Per Этап2 §10.15, a team's uploaded file is seen by the host AND
  the other teams. So presentation payloads MAY carry a file's `publicUrl`
  room-wide, every one of the nine events is room-audience, and there is
  **nothing to hide**. Sub-stage 9.3 therefore does NOT apply the §16.5 R3-style
  team-gating to these events — that gating exists only to keep a purchased QR
  secret, and a public presentation file has no such secret. Do not copy the
  commerce privacy pattern here by inertia.
- **No client commands.** There is no `client:presentation:*` command surface.
  Upload and replace are REST multipart calls (§15.10, sub-stage 9.3); the host
  starts the preparation timer over REST — `POST rooms/:code/presentation/start-preparation`
  (HostAuthGuard, 200), the REST trigger for the §16.6 pair (sub-stage 9.2). The
  broadcasts above are the only presentation transport, server → client only.
- **9.2 emits the preparation pair; 9.3 the submission/files chain.** Sub-stage
  9.1 shipped the skeleton (read models, the submission fact, the two
  repositories, the exported ports, the real `GET requirements`) and emitted
  nothing. Sub-stage 9.2 wires `preparation-started` then `timer-started` from
  `StartPresentationPreparationUseCase` (room-wide, public, IN-transaction) and
  the public `GET deadline` / `GET submissions` reads. The room is ALREADY in
  PRESENTATION_PREPARATION (the 8.2 final-shop close parked it there), so — unlike
  CloseShop — the use case changes NO room state (no Room mutator, no
  `rooms.update`, STAGE_FLOW untouched: the exit to PRESENTATION_DEFENSE lands in
  Stage 10). A repeat start REPLACES the in-memory timer with fresh stamps and
  re-emits both (clients resync, no error). 9.3 wires the submission/files
  broadcasts (exactly as 8.1 → 8.2/8.3 for commerce).
- **9.3 upload chain — order and timing.** `UploadPresentationUseCase` is a
  TWO-PHASE upsert: the bytes stream to MinIO OUTSIDE the transaction/lock (so a
  25 MB upload never holds a pooled connection — recon M1), then a short
  locked transaction persists the row. The broadcasts fire AFTER commit (they
  carry the `publicUrl` of a now-durable row, the 8.3 `inventory-updated`
  precedent), in a fixed order: `submission-uploaded` OR `submission-replaced`
  first, then `submission-late` (iff the upload was late), then `files-updated`
  LAST. All are room-wide and public; there is no team-gated channel here.
- **Stored MIME is server-canonical, not the client type (B2).** The persisted
  `mimeType` (and the response `Content-Type`, plus `Content-Disposition:
  attachment`) is derived from the file EXTENSION — a public-read bucket must
  never serve a `.pdf` full of HTML as `text/html`. The storage key likewise
  uses only an allowlisted extension token, never the raw filename (C).
- **`LATE_PENALTY` is 1 (env), not the plan's 2.** The operator kept the `.env`
  default `LATE_PENALTY=1`; `submission-late.latePenalty` and the persisted
  EFFECTIVE penalty therefore carry 1 when late, 0 when on time. Stage 10 applies
  `max(0, rawScore − latePenalty)`.
- **`submission-status-changed` is Superseded.** The status is decided once at
  create (UPLOADED vs LATE) and a replace is a fresh create — there is no
  in-place status transition, so the event has no trigger. The constant stays in
  the catalog like the unemitted `shop-purchase-rejected`.
- **Orphan / separate-origin are Stage-11 debts (MVP).** Changing the file's
  extension on a replace leaves the old object behind (the port has no `delete`);
  and the public bucket shares the API origin, so the `Content-Disposition`
  attachment guard — not a separate asset host — is what neutralises stored XSS
  for now. Both are accepted MVP compromises, hardened in Stage 11.
- **The preparation timer is in-memory, no scheduler.** Like the answer (§16.4)
  and shop (§16.5) timers, the deadline is a lazy `ClockPort` comparison in
  `PresentationTimerRegistry`: `GET deadline` returns RUNNING/EXPIRED/IDLE
  against `now`, and `timer-ended` is never pushed (the EXPIRED read is the
  signal). No DB column; state does not survive a process restart (single-node
  MVP). `requirements-updated` is likewise never pushed — the catalog is static.

### Defense — server broadcasts (§16.7)

Catalog of the §16.7 "presentation defense" broadcasts. The constants live in
`src/game-session/application/events/defense-events.ts` (next to the game-session
use cases that emit them, Design A — exactly as commerce/presentation); there is
no separate defense module. **Sub-stage 10.1 emits all five** — StartDefense
opens the defenses, FinishPresentation / SkipPresenter advance the queue. The
**Status** column records each name's disposition. Every row is **room-wide and
PUBLIC** (see _Defense contract notes_ for why there is no secrecy here).

| Canonical name | Direction | Area | Audience | Purpose | Plan ref | Status |
|---|---|---|---|---|---|---|
| `server:defense:started` | server | defense | room | Defenses opened (PRESENTATION_PREPARATION → PRESENTATION_DEFENSE) — carries the whole presentation order | §16.7 | Emitted since 10.1 by StartDefenseUseCase (host `POST start`), FIRST of the start pair; payload `{ roomId, order }` (`order` = team ids, `turnOrder` ascending) |
| `server:defense:team-started` | server | defense | room | The next presenter is on | §16.7 | Emitted since 10.1 by StartDefenseUseCase (the first presenter, right AFTER `started`) and by Finish/Skip (each subsequent presenter); payload `{ roomId, teamId }` |
| `server:defense:team-finished` | server | defense | room | The current presenter's defense finished | §16.7 | Emitted since 10.1 by FinishPresentationUseCase (host `POST finish-presenter`), FIRST of the advance; payload `{ roomId, teamId }` (the presenter that just left) |
| `server:defense:team-skipped` | server | defense | room | The host skipped the current presenter | §16.7 | Emitted since 10.1 by SkipPresenterUseCase (host `POST skip-presenter`), FIRST of the advance; payload `{ roomId, teamId }`. The ONLY difference from `team-finished` — same advance otherwise |
| `server:defense:finished` | server | defense | room | The LAST presenter finished/skipped (PRESENTATION_DEFENSE → EVALUATION) | §16.7 | Emitted since 10.1 by Finish/Skip when there is no next presenter (end of the finite queue), in place of `team-started`; payload `{ roomId, nextStage }` (`nextStage` = EVALUATION) |

### Plan name → canonical name (§16.7)

Same derivation as §16.1–16.6: a plan token `x:y` becomes `server:defense:x-y`
in kebab-case (camelCase split on case, e.g. `teamStarted` → `team-started`).

| Plan name (§16.7) | Canonical name |
|---|---|
| `defense:started` | `server:defense:started` |
| `defense:teamStarted` | `server:defense:team-started` |
| `defense:teamFinished` | `server:defense:team-finished` |
| `defense:teamSkipped` | `server:defense:team-skipped` |
| `defense:finished` | `server:defense:finished` |

### Defense contract notes (§16.7)

- **The defense state is fully DERIVED — there is no defense table.** The current
  presenter is `Room.currentTeamId` (the same pointer the battle turn uses) and
  the order is the participating teams' `turnOrder` ascending (assigned at game
  start, §14.5). 10.1 adds **no** schema, **no** in-memory registry — the state
  lives in the existing columns and therefore survives a process restart
  (`db:generate` stays "No schema changes"). The public `GET defense/state`
  recomputes it on demand for reconnect/refresh.
- **The queue is FINITE — no wrap (the key contrast with the battle turn).** The
  battle turn is a round-robin that wraps with `% length` (review-answer
  `moveToNextTurn`); the defense queue does NOT. `nextDefensePresenter` returns
  `order[idx + 1] ?? null`, so past the last presenter there is no next team —
  and that `null` is exactly what drives the `finished` broadcast and the
  PRESENTATION_DEFENSE → EVALUATION exit.
- **StartDefense MOVES the stage (like CloseShop, unlike the 9.2 prep start).**
  The room is parked in PRESENTATION_PREPARATION after preparation/upload;
  StartDefense validates that stage, `transitionTo('PRESENTATION_DEFENSE')`,
  points the room at the first presenter and persists with `rooms.update` — two
  new STAGE_FLOW edges (PRESENTATION_PREPARATION → PRESENTATION_DEFENSE →
  EVALUATION). The 9.2 `start-preparation` changed no room state; this one does.
- **Host-paced, no timer.** Unlike the answer (§16.4), shop (§16.5) and
  preparation (§16.6) timers, there is NO defense timer/registry — the host drives
  the pace with `finish-presenter` / `skip-presenter`. No `ClockPort`, no
  scheduler, no deadline.
- **All public, room-wide, no client commands.** The defense order and progress
  hide nothing (the deliberate opposite of the §16.5 QR secrecy), so every event
  is room-audience with a public payload and 10.1 applies no team-gating. There is
  no `client:defense:*` surface: the three mutations are REST host actions —
  `POST rooms/:code/defense/{start,finish-presenter,skip-presenter}` (HostAuthGuard,
  200) — and `GET rooms/:code/defense/state` is the open read.
- **Emission order is fixed.** Start: `started` (the order) then `team-started`
  (the first presenter). Each advance: `team-finished` / `team-skipped` (the
  presenter leaving) first, then either `team-started` (the next presenter) or —
  on the last one — `finished` (`nextStage` = EVALUATION). EVALUATION is parked
  until Stage 10.2; the `EVALUATION → RESULTS → FINISHED` edges arrive with 10.3.

### Evaluation — server broadcasts (§16.8)

Catalog of the §16.8 "evaluation collection" broadcasts. The constants live in
`src/game-session/application/events/evaluation-events.ts` (next to the
game-session use cases that emit them, Design A — exactly as
commerce/presentation/defense); the evaluation module itself emits nothing.
**Sub-stage 10.2 emits all three** — SubmitEvaluation records a score,
ConfirmEvaluation freezes it. Every row is **room-wide**, and — the defining
rule here — **carries NO numeric score** (§16.8 "intrigue": the running tallies
stay secret until results, 10.3). The **Status** column records each name's
disposition.

| Canonical name | Direction | Area | Audience | Purpose | Plan ref | Status |
|---|---|---|---|---|---|---|
| `server:evaluation:score-submitted` | server | evaluation | room | A captain/host submitted (or re-submitted) one score | §16.8 | Emitted since 10.2 by SubmitEvaluationUseCase (captain `POST team` / host `POST host`), FIRST of the submit pair; payload `{ roomId, targetTeamId, evaluatorType, evaluatorTeamId, created }` — **no numeric score** (`evaluatorTeamId` null for a host) |
| `server:evaluation:score-confirmed` | server | evaluation | room | A captain/host confirmed (froze) one score | §16.8 | Emitted since 10.2 by ConfirmEvaluationUseCase (`POST team/confirm` / `POST host/confirm`), FIRST of the confirm group — one per frozen row (per-target: exactly one; all-at-once: one per remaining draft); payload `{ roomId, targetTeamId, evaluatorType, evaluatorTeamId }` — **no numeric score** |
| `server:evaluation:progress-updated` | server | evaluation | room | The running tally changed | §16.8 | Emitted since 10.2 by Submit (always) and Confirm (only when something was frozen), AFTER the score event(s); payload `{ roomId, team, host, totalExpected, complete }` where `team`/`host` are `{ submitted, confirmed, expected }` — **counts only** |
| `server:evaluation:completed` | server | evaluation | room | The game finished (RESULTS, FINISHED) | §16.8 | Emitted since 10.3 by CalculateResultsUseCase (host `POST results`) AFTER the transaction commits, FIRST of the results pair; payload `{ roomId, stage, status }` (stage RESULTS, status FINISHED) |
| `server:evaluation:results-calculated` | server | evaluation | room | The final leaderboard | §14.10 | Emitted since 10.3 by CalculateResultsUseCase AFTER commit, right after `completed`; payload `{ roomId, leaderboard }` where each entry is `{ teamId, teamName, earnedScore, presentationScoreRaw, latePenalty, presentationScoreFinal, finalScore, place }` — PUBLIC AGGREGATES (the individual `evaluation_scores` stay private) |
| `server:evaluation:results-shown` | server | evaluation | room | UI cue to reveal results | §16.8 | **Reserved** — a presentation-layer cue with no server trigger; the leaderboard ships via `results-calculated` / `GET results` |

### Plan name → canonical name (§16.8)

Same derivation as §16.1–16.7: a plan token `x:y` becomes `server:evaluation:x-y`
in kebab-case (camelCase split on case, e.g. `scoreSubmitted` → `score-submitted`).

| Plan name (§16.8) | Canonical name |
|---|---|
| `evaluation:scoreSubmitted` | `server:evaluation:score-submitted` |
| `evaluation:scoreConfirmed` | `server:evaluation:score-confirmed` |
| `evaluation:progressUpdated` | `server:evaluation:progress-updated` |
| `evaluation:completed` | `server:evaluation:completed` |
| `evaluation:resultsCalculated` | `server:evaluation:results-calculated` |

### Evaluation contract notes (§16.8)

- **Numbers are PRIVATE until results (the §16.8 "intrigue").** No broadcast and
  no progress payload carries a numeric score — only ids, the `created` flag, and
  the `{ submitted, confirmed, expected }` counts. The author's OWN numbers come
  back exclusively in their REST reply (`POST team`/`host` echoes the submitted
  `EvaluationScore`); there is deliberately NO GET surface for another evaluator's
  scores until Stage 10.3. `GET rooms/:code/evaluation/progress` is counts-only.
- **No StartEvaluation, no `started` event.** The room AUTO-entered EVALUATION
  when the last presenter's defense finished (10.1 `defense:finished`,
  PRESENTATION_DEFENSE → EVALUATION), so 10.2 adds no start action and no
  `started` broadcast (it would be additive later if ever needed).
- **Evaluator never trusted from the body.** A TEAM vote's `evaluatorTeamId` is
  derived from the acting captain's own team (captain-authz + a symmetric
  cross-tenant guard); a HOST vote's identity from `room.hostId`. A team can never
  score itself (`SelfEvaluationError` 403, before any write; the entity backstops
  the same shape).
- **Create-or-update + immutable confirm, under the per-room advisory lock** (the
  FIRST statement of each transaction). Re-submitting an unconfirmed score
  overwrites it; a confirmed score is frozen (`EvaluationAlreadyConfirmedError`
  409). Confirm has TWO granularities: per-target (STRICT — 404 if no draft, 409
  if already confirmed) and all-at-once (omit `targetTeamId` — freezes only the
  evaluator's remaining drafts, skipping already-confirmed rows so a per-target
  pass then an all-at-once finish never deadlocks; idempotent when nothing is
  left). The insert's unique-index 23505 is a defensive net only.
- **Emission order is fixed.** Submit: `score-submitted` then `progress-updated`.
  Confirm: one `score-confirmed` per frozen row, then a single `progress-updated`
  (skipped entirely when an all-at-once confirmed nothing). Results: `completed`
  then `results-calculated`, BOTH emitted AFTER the transaction commits (⚠️D — the
  §14.10 finish is irreversible and has no corrective event, so the broadcast must
  never precede the durable write).
- **All room-wide.** There is no `client:evaluation:*` surface: every mutation is a
  REST action — `POST rooms/:code/evaluation/{team,host}`, `.../{team,host}/confirm`
  and `.../results` (PlayerIdentityGuard / HostAuthGuard, 200) — and
  `GET rooms/:code/evaluation/{criteria,teams,progress,results}` are the open reads.
- **10.3 closes the backbone (EVALUATION → RESULTS, then FINISHED).**
  CalculateResults adds the `EVALUATION: ['RESULTS']` STAGE_FLOW edge and, in ONE
  transaction, `transitionTo('RESULTS')` then `markFinished` (status FINISHED).
  RESULTS is TERMINAL — there is deliberately NO `RESULTS → FINISHED` *stage*
  edge: FINISHED is the room STATUS, set by `markFinished`, not a stage. A repeat
  call is out of stage (already past EVALUATION) → 409 (idempotency); a partial
  tally is rejected by the completeness gate (`EvaluationNotCompleteError` 409)
  unless `force` is set. The individual scores STAY private — `results-calculated`
  / `GET results` expose only the per-team AGGREGATES.

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

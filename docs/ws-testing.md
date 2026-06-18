# Manual WebSocket Test Checklist

A reproducible, by-hand pass over the realtime (WebSocket) surface for a
**demonstrator or QA engineer**. The plan's §22 testing section says the
WebSocket layer "для MVP можно начать с ручных сценариев" (for the MVP, start
with manual scenarios) and lists the scenarios to walk; this file turns that
list into an executable checklist — for each scenario, **the REST action that
triggers it, the real event that should arrive, who should receive it, and how
to confirm it**.

This complements — does not replace — the automated realtime coverage
(`test/**` socket-delivery and host-delivery e2e specs). Automation proves the
events fire; this checklist lets a human watch them fire during a demo or a
pre-demo smoke test, and — crucially — confirm **audience** (who does *and does
not* receive each event), which is the part most easily broken and least obvious
from a single socket.

## Sources of truth (do not duplicate them here)

- **[realtime-events.md](realtime-events.md)** — the authoritative catalog of
  every event's canonical name, area, audience and **payload** (§16.1–§16.8).
  This checklist references events by their short name; the payload shapes live
  there.
- **[frontend-guide.md → §5](frontend-guide.md#5--websocket)** — how to connect a
  socket, the four audiences, and the two transport commands. §2.5 (anonymous
  socket) and §2.8 (`INVALID_RECONNECT_TOKEN`) cover the handshake edge cases.
- **[demo.md → §4](demo.md#4--the-demo-game-step-by-step)** — the same game
  narrated end-to-end with the exact REST calls and tokens; follow it to *drive*
  a full game while this file tells you *what to verify* at each step.

Every event name below is the friendly short form. Its fully-qualified wire form
is `server:<area>:<name>` — e.g. `player-joined` → `server:game-session:player-joined`,
`defense:started` → `server:defense:started`. The catalog lists both.

---

## Setup

### 1 · A WebSocket client to observe events

Any Socket.IO 4.x client works. Common choices:

- **Browser console** (most demo-friendly) — load `socket.io-client` and connect,
  then `socket.onAny((e, p) => console.log(e, p))` to log everything.
- **Postman** — has a native Socket.IO request type (set the event list to
  listen on, or listen to all).
- **A tiny Node script** with `socket.io-client` and `socket.onAny(...)`.

The connection recipe is fixed by
[frontend-guide → §5.1](frontend-guide.md#51--connecting):

```js
import { io } from 'socket.io-client';

const socket = io(BACKEND_URL, {        // e.g. http://localhost:3000
  path: '/socket.io',                   // must match WS_PATH
  transports: ['websocket'],
  auth: { reconnectToken },             // host OR player token; omit for anonymous
});
socket.onAny((event, payload) => console.log(event, payload));
```

> **Note:** `socket.io-client` is **not** plain `wscat`. The handshake is the
> Socket.IO protocol, not a raw WebSocket, so a bare `wscat ws://…` will not
> speak it — use a Socket.IO-aware client (browser/Postman/Node).

### 2 · Open three observer sockets — audience is the point

Audience is the property this checklist exists to verify, so open **three**
sockets at once and keep them side by side:

| Observer | Connect with | Sees |
|---|---|---|
| **HOST** | the host token (`auth.reconnectToken = hostReconnectToken`) | room-wide **and** host-only events |
| **TEAM** (a player) | that player's `reconnectToken` | room-wide **and** that team's team-only events |
| **ANON** (spectator) | no token, then send `client:realtime:join-room` with the room id | room-wide events **only** ([frontend-guide → §2.5](frontend-guide.md#25--the-anonymous-socket-spectator)) |

A test **passes** only when an event reaches exactly its documented audience —
e.g. `cell-selection-requested` must appear on HOST and **not** on TEAM/ANON;
`inventory-updated` must appear on the buying TEAM and **not** on a different
team or ANON.

### 3 · Drive the game over REST

Every game mutation is a **REST** call — WebSocket is observe-only here (the only
two client→server messages are `join-room`/`leave-room`, pure transport grouping;
see [frontend-guide → §5.3](frontend-guide.md#53--clientserver-commands)). Drive
the REST side with **Swagger (`/docs`)**, `curl`, or Postman, exactly as in
[demo.md → §3](demo.md#3--how-to-drive-the-backend-without-a-frontend). Save the
host token and each player token the instant they are issued — they are returned
once and never re-issued.

### 4 · Cross-check with the REST mirror

Most events have a REST read that reports the same state, so you can confirm an
effect even if you missed the live event: `GET /api/rooms/:code/game/state`,
`/board`, `/status`, `/game/stage`, `/shop/items`, `/presentation/files`,
`/evaluation/progress`, `/evaluation/results`, `/defense/state`. Timestamps in
payloads (`endsAt`, `uploadedAt`, …) are **ISO-8601 strings** over the wire, not
numbers.

---

## A · Connection & reconnect (§16.1)

The handshake foundation — verify this first; the canon scenario list (§B
onward) assumes a connected socket. None of these need a game in progress beyond
an existing room/player.

| # | Do this | Expect (event) | Audience | How to verify |
|---|---|---|---|---|
| A1 | Connect a socket with a **valid** token (host or player) | `connection-restored`, then `room-state` | originating socket | The connecting socket logs **both**, in that order; `room-state` carries the `{ room, players[], teams[] }` snapshot. This is the "join complete" signal. |
| A2 | Connect with **no** token (anonymous), then send `client:realtime:join-room` with the room id | (no identity events) then room-wide events | originating / room | Before `join-room`: silence. After: the socket starts seeing **room-wide** events only — never host-only or team-only. |
| A3 | Connect with a **non-empty but invalid** token | `error` (code `INVALID_RECONNECT_TOKEN`), then forced disconnect | originating socket | The socket receives a single `server:game-session:error` and is then disconnected by the server ([§2.8](frontend-guide.md#28--invalid_reconnect_token)). |
| A4 | Drop a player's **last** socket (close the tab/connection) | `connection-lost` | room | The HOST and other room sockets see `connection-lost` `{ roomId, playerId }`. (Multi-tab: fires only when that identity's last socket leaves.) |
| A5 | Reconnect that player (new socket, same token) | `client-reconnected` (room) + `connection-restored`/`room-state` (originating) | room + originating | Room sockets see `client-reconnected`; the reconnecting socket also gets its restored snapshot (as A1). |
| A6 | Reconnect the **host** (`POST /api/rooms/:code/host/reconnect` and/or a fresh host socket) | `host-reconnected` | room | Room sockets see `host-reconnected` `{ roomId, hostId }`. A host *drop* is cleanup-only — there is deliberately **no** host-disconnect event. |

---

## B · Lobby & game start (§16.2 / §16.3) — canon §22 scenarios 1–7

The room walks `LOBBY → TEAM_SETUP → READY_CHECK → GAME_BOARD`. All events here
are **room-wide**.

| # | Canon §22 scenario | Do this (REST) | Expect (event) | Audience | How to verify |
|---|---|---|---|---|---|
| 1 | ведущий создал комнату (host created room) | `POST /api/rooms` *(no auth)* | *(no broadcast — creation is REST)*; the first WS signal is `room-state` on the host socket | originating (host) | **There is no `room-created` event** — no sockets exist yet at creation. Connect the host socket (A1) and confirm the `room-state` snapshot shows the new room (`LOBBY`). |
| 2 | игроки подключились (players joined) | `POST /api/rooms/:code/players` *(no auth)*, once per player | `player-joined` | room | Each join fires one `player-joined` `{ roomId, player }`; all three observers see it. |
| 3 | команда создана (team created) | `POST /api/rooms/:code/teams` *(`X-Player-Token`)* | `team-created`; the **first** team also `game-stage-changed` → `TEAM_SETUP` | room | Watch `team-created` `{ roomId, team, captain }`. On the very first team, also a `game-stage-changed` with `stage: TEAM_SETUP`. |
| 4 | капитан назначен (captain assigned) | *(same call as #3; or `POST .../teams/:teamId/members` to add players)* | **No dedicated event.** The captain is the `captain` field of `team-created` (the creating player); a later captain change rides `team-updated` | room | **Do not wait for a `captain-assigned` event — none exists.** Confirm via `team-created.captain` (= the team creator, `isCaptain: true`) and via `team-updated.team.captainPlayerId` on any change. |
| 5 | тема выбрана (topic selected) | `PATCH /api/rooms/:code/teams/:teamId/topic` *(`X-Player-Token`, the captain)* | `team-topic-selected` | room | Watch `team-topic-selected` `{ roomId, team }` with the chosen `selectedTopicId`. |
| 6 | команды готовы (teams ready) | `PATCH /api/rooms/:code/teams/:teamId/ready` *(`X-Player-Token`)* with `isReady:true` | `team-ready-changed`; on crossing `MIN_TEAMS_TO_START`, also `game-can-start-changed` and `game-stage-changed` → `READY_CHECK` | room | Each toggle → `team-ready-changed`. When enough teams are ready, `game-can-start-changed` `{ canStart, readyCount }` (room-wide today — see note) and a `READY_CHECK` stage change. |
| 7 | игра стартовала (game started) | `POST /api/rooms/:code/game/start` *(`X-Host-Token`)* | a burst: `game-started`, `game-first-team-selected`, `game-stage-changed` → `GAME_BOARD`, `game-turn-changed`, `game-state-updated` | room | All five arrive; `game-stage-changed.stage` is `GAME_BOARD`, `game-turn-changed.currentTeamId` names the first team. Cross-check `GET /game/stage` = `GAME_BOARD`. |

> **`game-can-start-changed` is room-wide.** The catalog target is the host, but
> it is currently broadcast to the whole room; non-host clients may ignore it.

---

## C · Gameplay / battle (§16.4) — canon §22 scenarios 8–13

One cell = one cycle, repeated until the board is exhausted. **Note the two
host-only events** — this section is where audience verification matters most.

| # | Canon §22 scenario | Do this (REST) | Expect (event) | Audience | How to verify |
|---|---|---|---|---|---|
| 8 | вопрос выбран (cell/question selected) | `POST /api/rooms/:code/board/select` *(`X-Player-Token`, the active captain)* | `cell-selection-requested` | **host-only** | **Must appear on HOST only.** Confirm the TEAM and ANON sockets do **not** receive it. *(The room-wide `cell-selected` is reserved/superseded — never sent.)* |
| 9 | ведущий подтвердил (host confirmed) | `POST /api/rooms/:code/questions/open` *(`X-Host-Token`)* | `cell-selection-approved`, `question-opened`, `question-timer-started` | room | All three room-wide. `question-opened` carries the question text **without** `correctAnswer`. Reject path instead: `POST .../questions/reject` → `cell-selection-rejected` (room). Optional host reveal: `POST .../questions/review` with `revealAnswer:true` → `question-correct-answer-shown-to-host` (**host-only**). |
| 10 | ответ принят (answer accepted) | `POST /api/rooms/:code/questions/answer` *(captain)*, then `POST /api/rooms/:code/questions/review` *(`X-Host-Token`)* with `accepted:true` | `answer-submitted` (on answer), then `answer-accepted` (on review) | room | `answer-submitted` **carries the answer text room-wide** (a live echo, not persisted) — all observers see the text. Then `answer-accepted`. Reject path: `accepted:false` → `answer-rejected` (same shape). |
| 11 | очки обновились (score updated) | *(part of the accept review in #10)* | `score-changed` | room | On accept, `score-changed` `{ teamId, earnedScore, balance, delta }` with a **positive** `delta` (the cell's points). Cross-check team score in `GET /game/state`. |
| 12 | ячейка заблокировалась (cell blocked) | *(part of the review in #10, both accept and reject)* | `cell-blocked`, then `board-state-updated` | room | `cell-blocked` `{ cellId, state: BLOCKED, answeredByTeamId }` fires on **both** outcomes (`answeredByTeamId` null on reject); a `board-state-updated` snapshot follows. |
| 13 | ход перешёл (turn passed) | *(part of the review in #10, both outcomes)* | `game-turn-changed` | room | `game-turn-changed.currentTeamId` flips to the other team after **every** review, accepted or rejected. |

> **Timeout instead of an answer:** `POST /api/rooms/:code/game/advance`
> *(`X-Host-Token`)* fires `question-timer-ended` (room) and moves to
> `ANSWER_REVIEW`. The 60s answer timer is informational — no server scheduler;
> the timer surfaces only via this lazy bridge, never a pushed countdown.

---

## D · Commerce / shop (§16.5) — canon §22 scenarios 14–16

The shop opens after every 6th blocked cell (6th/12th/18th/24th) and a **final**
shop after the 30th. **`inventory-updated` is team-only** — the QR is secret.

| # | Canon §22 scenario | Do this (REST) | Expect (event) | Audience | How to verify |
|---|---|---|---|---|---|
| 14 | магазин открылся (shop opened) | *(automatic after the 6th-cadence review; final shop after the 30th)* | `shop-opened` (or `shop-final-opened` on the exhausted board) | room | Arrives **last** in the review block; carries `{ currentShopRound, startedAt, endsAt, minClosableAt }`. Cross-check `GET /shop/round`. Host closes later with `POST /shop/close` → `shop-closed` `{ nextStage }`. |
| 15 | товар куплен (item purchased) | `POST /api/rooms/:code/shop/purchase` *(`X-Player-Token`, a captain buying for their own team)* | `score-changed` (negative delta), `shop-item-purchased`, `shop-item-unavailable`, `shop-state-updated` | room | All room-wide and **carry no QR content**. `score-changed` here has a **negative** `delta` (only `balance` moves; `earnedScore` holds). |
| 16 | инвентарь обновился (inventory updated) | *(same purchase as #15)* | `inventory-updated` | **team-only** | **Must appear on the buying TEAM only**, after commit, carrying the QR `publicUrl`. Confirm a *different* team's socket and ANON do **not** receive it. *(`shop-purchase-rejected` is reserved — a rejected buy is the REST **409**, not an event.)* |

---

## E · Presentation (§16.6) — canon §22 scenarios 17–19

Presentation files are **public by design** (the opposite of the QR secret), so
every event here is room-wide and may carry `publicUrl`.

| # | Canon §22 scenario | Do this (REST) | Expect (event) | Audience | How to verify |
|---|---|---|---|---|---|
| — | *(host opens preparation)* | `POST /api/rooms/:code/presentation/start-preparation` *(`X-Host-Token`)* | `preparation-started`, then `timer-started` | room | Both room-wide; the deadline is at `GET /presentation/deadline`. A repeat start replaces the timer and re-emits both. |
| 17 | презентация загружена (presentation uploaded) | `POST /api/rooms/:code/presentation/upload` *(`X-Player-Token`, multipart field `file`)* | `submission-uploaded` (first), then `files-updated` (last) | room | After commit. `submission-uploaded` carries the submission incl. `publicUrl` and the **server-canonical** `mimeType`. A replace (`PUT .../upload`) emits `submission-replaced` instead. |
| 18 | файл появился у всех (file visible to everyone) | *(same upload as #17)* | `files-updated` | room | The whole-room catalog `{ files: [{ teamId, originalFileName, publicUrl, … }] }` — the same projection as `GET /presentation/files`. Confirm **every** observer (incl. ANON) receives it: the file is public. *(For "file survives a backend restart", see the MinIO durability check in [minio.md](minio.md) — that is §22's MinIO section, not a WS event.)* |
| 19 | просрочка дала штраф (late upload penalized) | upload **after** the prep deadline | `submission-late` | room | Fires **only** when the upload is late, between `submission-uploaded` and `files-updated`; carries `{ submissionId, latePenalty }` (effective `LATE_PENALTY`, default **1**). Verify it does **not** fire on an on-time upload. |

> Reserved here (never arrive): `requirements-updated` (the catalog is static —
> read `GET /presentation/requirements`), `timer-ended` (the deadline surfaces
> via `GET /presentation/deadline`), `submission-status-changed`.

---

## F · Defense (§16.7) — beyond the canon §22 WS list

The §22 list jumps from the upload straight to evaluations, so the defense phase
has **no canon §22 scenario** — but the events are live (Stage 10.1) and a full
demo passes through them, so verify them too. All five are **room-wide and
public**; the host paces the queue (no timer). The queue is **finite — it does
not wrap**.

| # | Do this (REST) | Expect (event) | Audience | How to verify |
|---|---|---|---|---|
| F1 | `POST /api/rooms/:code/defense/start` *(`X-Host-Token`)* | `defense:started` (with the full `order`), then `defense:team-started` (first presenter) | room | Stage → `PRESENTATION_DEFENSE`. `order` is the participating teams by ascending turn order. |
| F2 | `POST /api/rooms/:code/defense/finish-presenter` (or `…/skip-presenter`) *(`X-Host-Token`)* | `defense:team-finished` (or `defense:team-skipped`), then `defense:team-started` (next) | room | One per team. The only difference between finish and skip is the event name; the advance is identical. |
| F3 | finish/skip the **last** presenter | `defense:finished` `{ nextStage: EVALUATION }` (in place of `team-started`) | room | The room moves itself to `EVALUATION`. Cross-check `GET /defense/state`. |

---

## G · Evaluation & results (§16.8) — canon §22 scenarios 20–21

Scores stay **secret** until results: no collection event carries a number.

| # | Canon §22 scenario | Do this (REST) | Expect (event) | Audience | How to verify |
|---|---|---|---|---|---|
| 20 | оценки отправлены (evaluations submitted) | `POST /api/rooms/:code/evaluation/team` *(captain)* / `…/evaluation/host` *(`X-Host-Token`)*; then `…/team/confirm` / `…/host/confirm` | `score-submitted` then `progress-updated` (on submit); `score-confirmed` then `progress-updated` (on confirm) | room | **No payload carries a numeric score** — only ids, the `created` flag, and `{ submitted, confirmed, expected }` counts. Your own numbers come back **only** in the REST reply. A team scoring itself is rejected (403). |
| 21 | результаты рассчитаны (results calculated) | `POST /api/rooms/:code/evaluation/results` *(`X-Host-Token`)* | `completed`, then `results-calculated` | room | Both fire **after commit**, in this order. `completed` = `{ stage: RESULTS, status: FINISHED }`; `results-calculated` carries the public leaderboard aggregates (individual evaluator scores stay private). Cross-check `GET /evaluation/results`. |

> Reserved here (never arrives): `results-shown` — a UI cue with no server
> trigger; the leaderboard ships via `results-calculated` / `GET results`.

---

## §22 coverage matrix

Every bullet of the plan's §22 "WebSocket-тестирование" list, mapped to the real
event(s). The canon enumerates **21 bullets** (commonly referred to as "the 20
manual scenarios"); all 21 are covered above and listed here. Audience is the
**implemented** audience (verified against [realtime-events.md](realtime-events.md)
and the event constants in `src/game-session/application/events/`).

| § | Canon §22 bullet | Real event(s) | Audience | Checklist row |
|---|---|---|---|---|
| 1 | ведущий создал комнату | *(REST only; `room-state` on host connect)* | originating | §B-1 |
| 2 | игроки подключились | `player-joined` | room | §B-2 |
| 3 | команда создана | `team-created` (+ `game-stage-changed`) | room | §B-3 |
| 4 | капитан назначен | *(no event — `team-created.captain` / `team-updated`)* | room | §B-4 |
| 5 | тема выбрана | `team-topic-selected` | room | §B-5 |
| 6 | команды готовы | `team-ready-changed` (+ `game-can-start-changed`) | room | §B-6 |
| 7 | игра стартовала | `game-started` (+4 in the burst) | room | §B-7 |
| 8 | вопрос выбран | `cell-selection-requested` | **host-only** | §C-8 |
| 9 | ведущий подтвердил | `cell-selection-approved`, `question-opened`, `question-timer-started` | room | §C-9 |
| 10 | ответ принят | `answer-submitted` → `answer-accepted` | room | §C-10 |
| 11 | очки обновились | `score-changed` (positive delta) | room | §C-11 |
| 12 | ячейка заблокировалась | `cell-blocked` (+ `board-state-updated`) | room | §C-12 |
| 13 | ход перешёл | `game-turn-changed` | room | §C-13 |
| 14 | магазин открылся | `shop-opened` / `shop-final-opened` | room | §D-14 |
| 15 | товар куплен | `shop-item-purchased` (+ `shop-item-unavailable`, `shop-state-updated`, `score-changed` −δ) | room | §D-15 |
| 16 | инвентарь обновился | `inventory-updated` | **team-only** | §D-16 |
| 17 | презентация загружена | `submission-uploaded` / `submission-replaced` | room | §E-17 |
| 18 | файл появился у всех | `files-updated` | room | §E-18 |
| 19 | просрочка дала штраф | `submission-late` | room | §E-19 |
| 20 | оценки отправлены | `score-submitted` → `progress-updated` (+ `score-confirmed`) | room | §G-20 |
| 21 | результаты рассчитаны | `completed` → `results-calculated` | room | §G-21 |

**Two canon bullets have no dedicated event** — both are real findings, not gaps
in the build:

- **#1 "host created room"** — room creation is REST (`POST /api/rooms`); no
  socket exists at that instant, so there is no `room-created` broadcast. The
  observable WS effect is the `room-state` snapshot the host receives on connect.
- **#4 "captain assigned"** — there is no `captain-assigned` event. The first
  player to create a team *is* the captain, carried in `team-created.captain`; a
  later captain change rides `team-updated`. Do not wait for a standalone event.

## Reserved / superseded events — never wait for these

These names exist in the catalog but are **never emitted today**, so do not wire
a handler that blocks on them (full rationale in
[frontend-guide → §5.5](frontend-guide.md#55--gotchas)):

`cell-selected`, `player-left`, `shop-purchase-rejected`, `requirements-updated`,
`timer-ended`, `submission-status-changed`, `results-shown`.

Notably: a **rejected purchase** is the REST **409**, not a socket event; the
**answer / shop / preparation timers** surface via their `GET` reads, never a
pushed `timer-ended`.

## Counts (as implemented today)

**57** distinct server→client events are emitted, **7** further catalog names are
reserved/superseded (listed above), and **2** client→server commands exist
(`join-room`, `leave-room`). The authoritative list is
[realtime-events.md](realtime-events.md).

---

## Sign-off

A run is **complete** when every row in §A–§G has been observed with the correct
audience. A row **fails** if its event does not arrive, arrives at the wrong
audience (e.g. a host-only or team-only event leaks room-wide), or carries
content it must not (a `correctAnswer` or a QR `publicUrl` in a room-wide
payload). Record date, build (`git rev-parse --short HEAD`), and any failing row.

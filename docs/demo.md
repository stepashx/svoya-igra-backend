# Demo Walkthrough

A prose, step-by-step guide to bringing the backend up and **playing one full
demo game** of *"Своя игра: собери презентацию проекта"* — from an empty lobby
to a finished result with a leaderboard.

This document is for the **demonstrator**: the person showing the backend off
without a frontend. There is no UI here (this repo is backend only — see the
[README](../README.md)), so a demo is a sequence of **REST calls** (driven from
Swagger UI, `curl`, or Postman) while **watching the WebSocket events** that
each call broadcasts. A real frontend consumes exactly the same surface; the
[frontend integration guide](frontend-guide.md) is the consumer's-eye view of
the very same flow.

The walkthrough below is the same path the automated acceptance test plays — it
drives a room from `LOBBY` all the way to `RESULTS`/`FINISHED` through nothing
but real REST endpoints. If you want the *programmatic* proof rather than a
manual run, that test is
[`test/acceptance/full-game.e2e-spec.ts`](../test/acceptance/full-game.e2e-spec.ts);
this guide is its human-paced narration.

---

## 1 · Prerequisites and bring-up

You need the same toolchain the project uses everywhere — see the
[README → Prerequisites](../README.md#prerequisites) and
[README → Setup](../README.md#setup) for the canonical instructions; this is the
short version:

- **Node.js 22** (LTS) and **npm**.
- **Docker** + **Docker Compose v2** (`docker compose`), which provide
  **PostgreSQL** and **MinIO**.

The fastest demo posture is the backend on the host with the infrastructure in
Docker ([local-development → run mode B](local-development.md#run-mode-b--backend-on-host-infra-in-docker)):

```bash
cp .env.example .env                  # local-dev defaults work out of the box
docker compose up -d postgres minio   # start PostgreSQL + MinIO
npm install                           # dependencies (incl. data-layer tooling)
npm run db:migrate                    # create the schema
npm run db:seed                       # load the demo catalog + provision the MinIO bucket
npm run start:dev                     # run the backend with reload
```

`db:migrate` and `db:seed` run **on the host**, are **idempotent**, and `db:seed`
is what provisions the MinIO bucket the presentation upload needs — skip it and
the health check stays red and uploads fail. For all the variations (everything
in Docker, the npm scripts, host-vs-container config) defer to the
[README](../README.md) and [local-development.md](local-development.md) rather
than re-deriving them here.

### What you get once it is up

Everything is one process on one origin — the default `http://localhost:3000`
(set by `PORT` in [`.env.example`](../.env.example)):

| Surface | URL | Use it to |
|---|---|---|
| **Swagger UI** | `http://localhost:3000/docs` | Browse and **execute** every REST endpoint (the primary demo driver) |
| **Health** | `http://localhost:3000/api/health` | Confirm the stack is green (`200` = all reachable; `503` = a dependency or the bucket is missing) |
| **WebSocket** | `http://localhost:3000` path `/socket.io` | Connect a Socket.IO client to watch the live events |
| **MinIO console** | `http://localhost:9001` | Inspect uploaded presentation files (login `minioadmin` / `minioadmin`) |

Before starting a game, open `http://localhost:3000/api/health` and confirm
`status: "ok"`. A red `storage` check almost always means `db:seed` has not run
yet (see [README → Health](../README.md#health) and [minio.md](minio.md)).

### Demo caveats — read these first

- **One continuous session.** Socket presence and the answer / shop /
  presentation timers live **in process memory** (see
  [README → Known limitations](../README.md#known-limitations)). They are lost on
  restart. **Do not restart the backend in the middle of a demo game** — run the
  whole game in one uninterrupted process. (Room state itself is in PostgreSQL
  and survives, but in-flight timers and socket presence do not.)
- **The content is generic placeholder.** The catalog is "Категория 1",
  "Вопрос — …", "Товар 1", "Тема 1". The demo showcases the **mechanics** (the
  stage machine, scoring, shop, upload, defense, evaluation), not the subject
  matter. Bring your own narration for the questions.
- **QR assets are placeholders.** The six seeded QR tools are catalog
  placeholders, not scannable codes — buying one proves the *commerce + private
  inventory* mechanic, not a working QR.
- **Real timers, not the test's fast ones.** The acceptance test swaps in a 2-second
  shop window for speed; a live demo uses the real defaults from
  [`.env.example`](../.env.example): an answer window of `60s`, a shop window of
  `120s` that **cannot be closed before `SHOP_MIN_SECONDS=30`**, and a
  presentation-prep window of `600s` (10 minutes). Plan for the 30-second
  minimum-close wait each time you close the shop.

---

## 2 · What is in the demo catalog

`npm run db:seed` loads a small, fixed catalog (the JSON under
`src/infrastructure/database/seeds/data/`; see
[migrations-and-seeds.md](migrations-and-seeds.md)). **Teams and players are
not seeded** — they are created by live play. What you start with:

| Catalog | Count | Shape |
|---|---|---|
| **Categories** | 6 | "Категория 1" … "Категория 6" |
| **Questions** | 30 | Six per tier at **100 / 200 / 400 / 600 / 800** points — a **6 × 5 board** |
| **Shop items** | 6 | "Товар 1" … "Товар 6", priced **100 → 600** in steps of 100, each tied to a QR tool |
| **QR tools** | 6 | "QR-инструмент 1" … "6" (placeholder assets) |
| **Presentation topics** | 4 | "Тема 1" … "Тема 4" — what a team optionally picks in `TEAM_SETUP` |
| **Presentation requirements** | 4 | "Условие 1" … "4" (three required, one optional) — shown in `PRESENTATION_PREPARATION` |
| **Evaluation criteria** | 2 | **"Раскрытие темы"** and **"Дизайн презентации"**, each scored **0–10** |

The board is the heart of the demo: **6 categories × 5 tiers = 30 cells**. The
question and answer text is generic, so the host can accept or reject answers at
will — correctness is the host's call, not the catalog's.

---

## 3 · How to drive the backend without a frontend

A demo is **REST calls + watching WebSocket events**. Pick whichever driver
suits your audience:

- **Swagger UI (`/docs`)** — the recommended driver. Every endpoint is listed
  with its request/response shapes, and **"Try it out"** executes it live
  against the `/api` base. Attach the auth header (below) per request.
- **`curl` / Postman** — fine for a scripted or terminal-first demo. Postman
  also has a Socket.IO client if you want events in the same tool.

**Authentication is two opaque tokens, issued once.** There is no login. Full
detail is in [frontend-guide → §2](frontend-guide.md#2--authentication); the demo
essentials:

| | Host token | Player token |
|---|---|---|
| Comes from | `POST /api/rooms` (field `hostReconnectToken`) | `POST /api/rooms/:code/players` (field `reconnectToken`) |
| REST header | `X-Host-Token` | `X-Player-Token` |

> **Save every token the instant you read it.** Each token is returned **exactly
> once**, in the body of the create/join call, and is **never re-issued**
> ([frontend-guide → §2.2](frontend-guide.md#22--tokens-are-issued-once--save-them)).
> Lose it and that identity is gone. Keep a scratch note mapping each name to its
> token — you will reuse the host token for every host action and each player's
> token for that player's actions throughout the game. **This is the single most
> common demo mistake.**

**Watching events.** Open a Socket.IO client (a browser console or a small Node
snippet — the connection recipe is in
[frontend-guide → §5.1](frontend-guide.md#51--connecting)) with
`auth.reconnectToken` set to the host token. On connect the backend auto-joins
your room and replays a `room-state` snapshot, then streams the live events. If
you connect **without** a token you see nothing until you send
`client:realtime:join-room` for the room id — and even then only the room-wide
events, never the host-only or team-only ones
([frontend-guide → §2.5](frontend-guide.md#25--the-anonymous-socket-spectator)).
For the exact event names, audiences, and payloads, keep
[realtime-events.md](realtime-events.md) open. If you would rather not wire a
socket at all, every event below has a **REST mirror** — `GET
/api/rooms/:code/game/state`, `/board`, `/status`, and `/game/stage` expose the
same state the events announce.

In the walkthrough, "**watch**" lists the events by their friendly names; their
fully-qualified form is `server:<area>:<name>` (e.g. `player-joined` →
`server:game-session:player-joined`).

---

## 4 · The demo game, step by step

This is the core of the document: one full game, narrated as a human runs it.
Each step names **the call** (method + `/api/...` path + which token), **the
transition** it causes, and **the events to watch**. It mirrors the seven
scenarios in [frontend-guide → §4](frontend-guide.md#4--scenarios-rest--ws-end-to-end)
and the live run in
[`test/acceptance/full-game.e2e-spec.ts`](../test/acceptance/full-game.e2e-spec.ts).
For exact request bodies and response DTOs, follow each call into **Swagger
(`/docs`)**.

A note on response codes that trips people up: the **creating** POSTs (`/rooms`,
`/players`, `/teams`, `/teams/:id/members`) return **201**; every **game-action**
POST returns **200** ([frontend-guide → §4](frontend-guide.md#4--scenarios-rest--ws-end-to-end)).

### Act 1 — Lobby → board

The room walks `LOBBY → TEAM_SETUP → READY_CHECK → GAME_BOARD`.

1. **Create the room** — `POST /api/rooms` *(no auth)*. The reply carries the
   room **`code`** and the **`hostReconnectToken`** — **save both**. Stage:
   `LOBBY`.
2. **Players join** — `POST /api/rooms/:code/players` *(no auth)*, once per
   person, with a display name. Each reply carries that player's
   **`reconnectToken`** — **save each one**. Watch: room-wide `player-joined`.
   *(The minimum is two players, one per team — say Alice and Bob.)*
3. **Create teams** — `POST /api/rooms/:code/teams` *(`X-Player-Token`)*. **The
   player who creates a team becomes its captain.** Have Alice create "Reds" and
   Bob create "Blues". Watch: `team-created`; the **first** team also fires
   `game-stage-changed` → **`TEAM_SETUP`**. *(Extra players can join an existing
   team with `POST /api/rooms/:code/teams/:teamId/members`, firing `team-joined`
   + `team-updated`.)*
4. **Pick a topic (optional)** — read the four presentation topics from
   `GET /api/topics` *(no auth)*, then `PATCH /api/rooms/:code/teams/:teamId/topic`
   *(`X-Player-Token`, the captain)*. Watch: `team-topic-selected`. A team that
   skips this is **auto-assigned** a topic at game start, so you can demo both
   paths (e.g. Reds picks, Blues leaves it).
5. **Ready up** — each captain calls
   `PATCH /api/rooms/:code/teams/:teamId/ready` *(`X-Player-Token`)* with
   `isReady: true`. Watch: `team-ready-changed` and `game-can-start-changed`. When
   the ready count reaches **`MIN_TEAMS_TO_START` (2)**, also
   `game-stage-changed` → **`READY_CHECK`**.
6. **Start the game** — `POST /api/rooms/:code/game/start` *(`X-Host-Token`)*.
   Watch a burst: `game-started`, `game-first-team-selected`,
   `game-stage-changed` → **`GAME_BOARD`**, `game-turn-changed`,
   `game-state-updated`. Turn order is now assigned to both teams.

At this point `GET /api/rooms/:code/game/stage` returns `GAME_BOARD`, and `GET
/api/rooms/:code/board` returns the 30-cell board. (Scenario detail:
[frontend-guide → §4.1](frontend-guide.md#41--lobby).)

### Act 2 — The battle cycle (repeated until the board is exhausted)

Each cell is one cycle. The **active team** is whichever team's turn it is —
read it from `currentTeamId` in `GET /api/rooms/:code/game/state`; the turn
**alternates after every review**, accepted or rejected.

1. **Select a cell** — `POST /api/rooms/:code/board/select` *(`X-Player-Token`,
   the active team's captain)* with the cell id. Watch: **host-only**
   `cell-selection-requested` (a player socket will not see this).
2. **Host opens the question** — `POST /api/rooms/:code/questions/open`
   *(`X-Host-Token`)*. Stage → **`QUESTION_OPENED`**. Watch:
   `cell-selection-approved`, `question-opened` (the question text, **without**
   the correct answer), `question-timer-started`. *(The host may instead reject
   the pick with `POST /api/rooms/:code/questions/reject`, returning the captain
   to the board.)*
3. **Captain answers** — `POST /api/rooms/:code/questions/answer`
   *(`X-Player-Token`)* with the answer text. Stage → **`ANSWER_REVIEW`**.
   Watch: room-wide `answer-submitted` — note this **carries the answer text** to
   the whole room (a live echo, not persisted).
4. **Host reviews** — `POST /api/rooms/:code/questions/review` *(`X-Host-Token`)*
   with `accepted: true` (or `false`). Watch: `answer-accepted` /
   `answer-rejected`; **on accept** then `score-changed` (positive delta = the
   cell's points credited to the active team), `cell-blocked`,
   `game-turn-changed`, `board-state-updated`.

**There is no auto-advance.** The 60-second answer timer is informational — there
is no server scheduler. If you want to demo a timeout instead of an answer, the
host bridges it with `POST /api/rooms/:code/game/advance` *(`X-Host-Token`)*,
which fires `question-timer-ended` and moves the room to `ANSWER_REVIEW`.

**The shop fork.** After a review, the room enters the **shop** if the count of
blocked cells is a multiple of 6 — i.e. on the **6th, 12th, 18th, 24th, and 30th**
answered question — *or* when the board is exhausted (that last fork is what ends
the battle phase; see Act 4). Otherwise it returns to `GAME_BOARD` for the next
team. This is **fork A** in
[frontend-guide → §3.5](frontend-guide.md#35--the-three-forks); the
[scenario](frontend-guide.md#42--battle) has the full event list.

### Act 3 — The shop

When the fork fires, the room is in **`SHOP`** and `shop-opened` (or
`shop-final-opened`, on the exhausted board) arrives last in the review block.

1. **Read the catalog** — `GET /api/rooms/:code/shop/items` and
   `GET /api/rooms/:code/shop/round` *(no auth)*. The round tells you whether
   this is the **final** shop and exposes the timer.
2. **Buy an item** — `POST /api/rooms/:code/shop/purchase` *(`X-Player-Token`,
   a captain buying for their own team)*. Watch: room-wide `score-changed` with a
   **negative** delta (only `balance` moves; the earned score holds),
   `shop-item-purchased`, `shop-state-updated` — **all without any QR content** —
   and then, **after commit**, a **team-only** `inventory-updated` carrying the
   QR `publicUrl`. The QR stays private to the buying team by design
   ([frontend-guide → §6](frontend-guide.md#6--files)).
3. **Host closes the shop** — `POST /api/rooms/:code/shop/close`
   *(`X-Host-Token`)*. Remember the **30-second minimum** (`SHOP_MIN_SECONDS`):
   a close attempted earlier is rejected — wait it out. Watch: `shop-closed`,
   carrying the `nextStage`. A **regular** shop returns to `GAME_BOARD` (resume
   Act 2); the **final** shop moves on to `PRESENTATION_PREPARATION` (this is
   **fork B**). Scenario: [frontend-guide → §4.3](frontend-guide.md#43--shop).

### Act 4 — Presentation: preparation and upload

The battle phase ends only when **all 30 cells are blocked**: the last answer
opens the **final shop**, and closing it transitions the room to
**`PRESENTATION_PREPARATION`**. (There is no shortcut out of the board — see
[§5](#5--the-short-demo-and-the-one-hard-rule).)

1. **Host opens preparation** — `POST /api/rooms/:code/presentation/start-preparation`
   *(`X-Host-Token`)*. Watch: room-wide `preparation-started` then
   `timer-started`. The prep window is `PRESENTATION_PREP_SECONDS` (10 minutes);
   read the deadline at `GET /api/rooms/:code/presentation/deadline`. The four
   "Условие" requirements are at `GET /api/rooms/:code/presentation/requirements`.
2. **Captains upload** — `POST /api/rooms/:code/presentation/upload`
   *(`X-Player-Token`, multipart form field **`file`**)*. Allowed formats are
   `pdf, ppt, pptx`, up to `MAX_FILE_SIZE_MB` (25 MB). Watch: after commit,
   room-wide `submission-uploaded`, then `submission-late` **only if** the upload
   was past the deadline (which applies `LATE_PENALTY=1`), then `files-updated`.
   The reply includes the file's `publicUrl`.
3. **Replace if needed** — `PUT /api/rooms/:code/presentation/upload` *(same
   token, multipart)* upserts the same row in place. Watch: `submission-replaced`
   then `files-updated`.
4. **Verify** — `GET /api/rooms/:code/presentation/submissions` (or `/files`)
   lists what was uploaded; the files are **public** by design
   ([frontend-guide → §6](frontend-guide.md#6--files)) and visible in the MinIO
   console. Scenario: [frontend-guide → §4.4](frontend-guide.md#44--presentation).

### Act 5 — Defense

1. **Host opens defenses** — `POST /api/rooms/:code/defense/start`
   *(`X-Host-Token`)*. Stage → **`PRESENTATION_DEFENSE`**. The reply carries the
   `order` (participating teams by ascending turn order) and the first
   `currentPresenterTeamId`. Watch: `defense:started` (with the whole order) then
   `defense:team-started`.
2. **Advance presenters** — `POST /api/rooms/:code/defense/finish-presenter`
   (or `.../skip-presenter`) *(`X-Host-Token`)*, once per team. Watch:
   `defense:team-finished` (or `…-skipped`), then `defense:team-started` for the
   **next** presenter. The queue is **finite — it does not wrap**.
3. **The last presenter** — finishing the final team fires `defense:finished`
   (`nextStage: EVALUATION`) instead of a `team-started`, and the room moves
   itself to **`EVALUATION`** (this is **fork C**). The defense state is fully
   **derived** — `GET /api/rooms/:code/defense/state` recomputes it, so a host
   reconnect mid-defense (`POST /api/rooms/:code/host/reconnect`) resumes exactly
   where it was. Scenario: [frontend-guide → §4.5](frontend-guide.md#45--defense).

### Act 6 — Evaluation

Each team and the host score **the other teams** against the two criteria.

1. **Read the criteria** — `GET /api/rooms/:code/evaluation/criteria` and the
   targets at `GET /api/rooms/:code/evaluation/teams` *(no auth)*. Progress is at
   `GET /api/rooms/:code/evaluation/progress` (**counts only**, no numbers).
2. **Submit scores** — captains call `POST /api/rooms/:code/evaluation/team`
   *(`X-Player-Token`)* and the host calls `POST /api/rooms/:code/evaluation/host`
   *(`X-Host-Token`)*, each with a `targetTeamId` and a score per criterion (e.g.
   `topicScore`, `designScore`). A team **cannot evaluate itself**. Watch:
   `score-submitted` then `progress-updated` — **neither carries a numeric
   score**; your own numbers come back only in the POST reply.
3. **Confirm** — `POST /api/rooms/:code/evaluation/team/confirm` and
   `.../host/confirm` *(matching token)*. Watch: `score-confirmed` (one per frozen
   row) then `progress-updated`. Confirm per target, or all-at-once by omitting
   `targetTeamId`.
4. **Check the gate** — `GET /api/rooms/:code/evaluation/progress` should now
   report `complete: true` once every participating team has been scored and
   confirmed. Scenario:
   [frontend-guide → §4.6](frontend-guide.md#46--evaluation--results).

### Act 7 — Results and finish

1. **Calculate results** — `POST /api/rooms/:code/evaluation/results`
   *(`X-Host-Token`)*. With every participating team ready, send an **empty body**
   — no `{ "force": true }` is needed (the Stage 12 liveness fix counts
   participating teams, so the gate is reachable on a normal complete game). Stage
   → **`RESULTS`** and the room's **`status` becomes `FINISHED`** in the same
   call. Watch, **after commit and in this order**: room-wide `completed`
   (stage `RESULTS`, status `FINISHED`) then `results-calculated` (the public
   leaderboard aggregates).
2. **Read the leaderboard** — `GET /api/rooms/:code/evaluation/results`
   *(no auth)*. It returns each team's `earnedScore`, the presentation score
   (raw, late penalty, final), the `finalScore`, and a dense `place`. Individual
   evaluator scores stay private. This read still works on a `FINISHED` room.
3. **Confirm the finish** — `GET /api/rooms/:code/status` returns
   `status: "FINISHED"` on `currentStage: "RESULTS"`. (`FINISHED` is a room
   **status**, never a stage you will observe — see
   [frontend-guide → §3.2](frontend-guide.md#32--status-vs-stage--orthogonal).)
   The game is over. A late `POST /api/rooms/:code/close` against the finished
   room is cleanly rejected with `409 ROOM_NOT_ACTIVE` — the finish won, nothing
   is corrupted.

That is a complete game: `LOBBY → TEAM_SETUP → READY_CHECK → GAME_BOARD →
(QUESTION_OPENED → ANSWER_REVIEW)×30 with SHOP at every 6th block →
PRESENTATION_PREPARATION → PRESENTATION_DEFENSE → EVALUATION → RESULTS`, status
`FINISHED`.

---

## 5 · The short demo, and the one hard rule

A full board is **30 cells**. The state machine has **one hard constraint**
worth knowing before you plan a short demo:

> **Presentation, defense, evaluation, and results are reachable only after the
> board is fully exhausted.** The *only* edge out of the `GAME_BOARD` loop is the
> **final shop** (fork B), which opens when the last of the 30 cells is blocked.
> There is no "skip to the end". To reach `RESULTS`/`FINISHED`, **all 30 questions
> must be answered.**

That is less work than it sounds — answers are not graded for correctness, so
each battle cycle is just select → open → answer → host-accept, a few seconds
each. Practical options, by time budget:

- **Full manual run (≈10–15 min).** Two teams (the `MIN_TEAMS_TO_START`), one
  captain each, play all 30 cells (accept every answer), buy once at a shop to
  show commerce, upload one deck each, run the defense, evaluate, and calculate
  results. This is the walkthrough above end to end.
- **Representative segment (≈3–5 min).** Run Act 1, play the first **6 cells** to
  trigger the **first shop** (Acts 2–3), then **explain** that the same loop
  repeats four more times until the board is exhausted, at which point Acts 4–7
  follow. Use this when you only need to show the lobby, the battle cycle, and the
  shop fork live.
- **Automated full run.** For a hands-off, end-to-end proof, run
  `npm run test:e2e` — `test/acceptance/full-game.e2e-spec.ts` plays the entire
  game through real REST transitions (it uses a fast shop timer purely so it
  doesn't wait out the real 30-second/2-minute windows).

To keep a manual run brisk, remember the real timing: the shop's 30-second
minimum-close applies at **every** shop window, and you can let captains answer
immediately rather than waiting out the 60-second answer timer.

---

## 6 · Demo troubleshooting

Most demo snags are environment, not logic. The full list is in the
[README → Troubleshooting](../README.md#troubleshooting); the demo-relevant ones:

- **Health shows `storage: error` / uploads fail / the board looks empty.** The
  catalog or the bucket is not provisioned. Run `npm run db:migrate` then
  `npm run db:seed` (the seed provisions the MinIO bucket — see
  [minio.md](minio.md)).
- **State seems lost mid-game / timers vanished.** The backend was restarted —
  presence and timers are in-memory and do not survive it. Start over and run the
  game in one continuous process (see the caveats in [§1](#1--prerequisites-and-bring-up)).
- **A call is rejected `401`/`403`.** You sent the wrong token, or none — host
  actions need `X-Host-Token`, player actions need `X-Player-Token`, and a player
  is checked for the right room/team. See
  [frontend-guide → §2.6](frontend-guide.md#26--401-vs-403--who-gets-what).
- **The shop won't close.** You are inside the 30-second minimum-close window
  (`SHOP_MIN_SECONDS`). Wait, then retry.
- **A port is already in use (`3000`, `5432`, `9000`, `9001`).** Another process
  or an old stack is bound — stop it, or change the port in
  [`.env`](../.env.example). See [README → Troubleshooting](../README.md#troubleshooting).
- **For run modes, config, and cleanup**, defer to
  [local-development.md](local-development.md).

---

## 7 · Where to go next

This guide is the demo orchestration; the references it leans on:

- **[README](../README.md)** — setup, the npm scripts, verifying the stack, and
  the project's limitations.
- **[local-development.md](local-development.md)** — the two run modes, the
  Compose topology, environment variables, and cleanup.
- **[frontend-guide.md](frontend-guide.md)** — the consumer's view of this exact
  flow: authentication (§2), the stage machine and its three forks (§3), the
  end-to-end REST→WS scenarios (§4), the WebSocket connection model (§5), and the
  file-privacy rules (§6).
- **[realtime-events.md](realtime-events.md)** — the authoritative WebSocket
  event catalog (names, directions, audiences, payloads).
- **Swagger UI (`/docs`)** — the authoritative REST reference; the demonstrator's
  primary driver.
- **[`test/acceptance/full-game.e2e-spec.ts`](../test/acceptance/full-game.e2e-spec.ts)**
  — the same game as an automated run, for a programmatic full-path proof.

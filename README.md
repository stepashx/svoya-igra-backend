# Build Your Project Presentation — Backend

[![CI](https://github.com/stepashx/svoya-igra-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/stepashx/svoya-igra-backend/actions/workflows/ci.yml)

Backend for the educational real-time multiplayer game *"Своя игра: собери
презентацию проекта"*. NestJS + TypeScript, PostgreSQL + Drizzle, MinIO
(S3-compatible) storage, WebSocket (Socket.IO), and Swagger — REST and WebSocket
share a single backend process/URL.

This repository is **backend only**. There is no frontend here; the frontend is
an external consumer of the REST API, WebSocket events, and public file URLs.

> **Status — game backbone complete.** A game now plays end to end, from the
> lobby through to a finished result. The full 12-stage lifecycle, the REST
> surface (13 controllers, browsable at Swagger `/docs`), the realtime events
> ([docs/realtime-events.md](docs/realtime-events.md)), and the data layer
> (PostgreSQL + Drizzle migrations and static seeds) are all implemented.
>
> Internal documentation (this stage) is complete — this README and the `docs/`
> set are in line with the implemented backbone. **Not yet done:** further test
> hardening and production concerns (deployment, real auth, private storage)
> deliberately deferred to post-MVP — see [Known limitations](#known-limitations)
> and [Roadmap](#roadmap).

## Prerequisites

- **Node.js 22** (LTS) and **npm** (the repo uses `package-lock.json`).
- **Docker** and **Docker Compose v2** (`docker compose`, not `docker-compose`).

## Setup

The canonical local flow runs the backend on the host against Compose-provided
PostgreSQL and MinIO:

```bash
cp .env.example .env                  # local-dev defaults work out of the box
docker compose up -d postgres minio   # start the infrastructure
npm install                           # install dependencies (incl. dev tooling)
npm run db:migrate                    # create the schema
npm run db:seed                       # load static catalogs + provision the MinIO bucket
npm run start:dev                     # run the backend with reload
```

`db:migrate` and `db:seed` run **on the host** — they use `drizzle-kit` /
`ts-node`, which are dev dependencies absent from the production backend image,
so they cannot run inside the container and instead connect to the
Compose-published `localhost` ports. Both are idempotent; see
[docs/migrations-and-seeds.md](docs/migrations-and-seeds.md).

### Everything in Docker

To run the backend in Compose too, build and start the full stack, then apply
the schema and seeds from the host (same reason as above):

```bash
cp .env.example .env
npm run docker:up     # build + start backend, postgres, minio (detached)
npm install           # host tooling for the data-layer scripts
npm run db:migrate
npm run db:seed
```

Stop everything:

```bash
npm run docker:down            # stop & remove containers (keeps data volumes)
npm run docker:reset:volumes   # also delete postgres + minio data (DESTRUCTIVE)
```

## npm scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` | Run the backend on the host with reload |
| `npm run start` / `npm run start:prod` | Run without watch / run the compiled `dist/` |
| `npm run build` | `nest build` → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`--max-warnings 0`) |
| `npm test` | Jest unit tests |
| `npm run test:e2e` | REST end-to-end tests (need PostgreSQL + MinIO) |
| `npm run db:migrate` | Apply migrations to the database |
| `npm run db:generate` | Regenerate migration SQL from the schema (offline) |
| `npm run db:check` | Validate the migration journal |
| `npm run db:seed` | Validate + load catalogs, provision the MinIO bucket |
| `npm run docker:up` | Build images and start the full stack (detached) |
| `npm run docker:down` | Stop and remove containers (data volumes kept) |
| `npm run docker:logs` | Follow logs from all services |
| `npm run docker:reset:volumes` | `down -v` — removes containers **and data** |
| `npm run docker:config` | Validate & print the resolved Compose config |

## Verifying the stack

| What | URL | Notes |
|---|---|---|
| Swagger UI | http://localhost:3000/docs | OpenAPI document for the REST surface |
| Health | http://localhost:3000/api/health | JSON report (see [Health](#health)) |
| MinIO console | http://localhost:9001 | login `minioadmin` / `minioadmin` |
| MinIO S3 API | http://localhost:9000 | used by the backend + public file URLs |

### Swagger

`http://localhost:3000/docs` serves the OpenAPI document for the REST surface,
grouped by the eight feature-area tags (Health, Game Session, Gameplay,
Commerce, Presentation, Defense, Evaluation, Realtime). It is the complete
browsable reference for the REST endpoints: every endpoint carries its
request/response DTOs, the shared error-envelope response, per-endpoint 4xx
status codes, and a file-picker on the upload endpoints.

### Health

`GET http://localhost:3000/api/health` returns `200` when every dependency is
reachable and `503` if any is not. Shape:

```json
{
  "status": "ok",
  "checks": {
    "backend": { "status": "ok" },
    "database": { "status": "ok" },
    "storage": { "status": "ok" }
  },
  "timestamp": "2026-05-31T00:00:00.000Z"
}
```

> **Storage check:** `storage` is green once `npm run db:seed` has provisioned
> the MinIO bucket. Before that — or if MinIO is down — it reports an error like
> `MinIO bucket "svoya-igra" does not exist` and the overall status is `503`. The
> probe is read-only and never creates the bucket. See
> [docs/minio.md](docs/minio.md).

### WebSocket

REST and WebSocket (Socket.IO, path `/socket.io`) share the same backend process
and URL. The event contracts — naming, payloads, rooms, reconnect — are
documented in [docs/realtime-events.md](docs/realtime-events.md).

### PostgreSQL / MinIO

```bash
docker compose ps          # STATUS column shows (healthy) for postgres & minio
docker compose logs minio  # or postgres, to inspect a specific service
```

## Architecture

- **Clean / Hexagonal** layering: domain (entities, value objects, ports) →
  application (use cases) → infrastructure (Drizzle persistence, MinIO storage)
  → presentation (controllers, gateways), wired with NestJS dependency injection.
- **NestJS** serves REST and WebSocket (Socket.IO) from one process; config is
  validated once at startup and read only through the typed Config module, never
  `process.env` directly.
- **Eight feature areas** (the Swagger tags): Health, Game Session, Gameplay,
  Commerce, Presentation, Defense, Evaluation, Realtime.
- **12-stage game lifecycle:** `LOBBY → TEAM_SETUP → READY_CHECK → GAME_BOARD →
  QUESTION_OPENED → ANSWER_REVIEW → SHOP → PRESENTATION_PREPARATION →
  PRESENTATION_DEFENSE → EVALUATION → RESULTS → FINISHED`.
- **PostgreSQL + Drizzle** (16 tables across five schema areas, one migration)
  for relational state; **MinIO** for file bytes (QR assets, presentation
  uploads), with only metadata in the database.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and
pull request to `master` (and on demand from the Actions tab), with three jobs:

- **Quality gate** — `typecheck → lint → build → test`, plus a schema-drift
  guard (`db:generate` must produce no diff).
- **E2E** — REST end-to-end tests against live PostgreSQL + MinIO, after
  `db:migrate` and `db:seed`.
- **Docker (optional)** — manual-only image build, never pushed.

There is **no deployment** — deferred until hosting is chosen. See
[docs/ci.md](docs/ci.md).

## Host vs container

The app reads all configuration through the typed Config module — never
`process.env` directly. Two values differ between running on the host and inside
Compose, and `docker-compose.yml` overrides them automatically for the backend
container:

| Variable | Host (`.env`) | Backend container | Why |
|---|---|---|---|
| `DATABASE_URL` | `...@localhost:5432/...` | `...@postgres:5432/...` | service name on the Compose network |
| `MINIO_ENDPOINT` | `localhost` | `minio` | service name on the Compose network |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | *(unchanged)* | the browser, not the backend, opens it |

See [.env.example](.env.example) for the full annotated variable list and
[docs/local-development.md](docs/local-development.md) for more detail.

## Troubleshooting

- **`docker compose` says variables are blank / config looks empty** — you have
  no `.env`. Run `cp .env.example .env`.
- **Port already in use (`3000`, `5432`, `9000`, `9001`)** — another process or
  an old stack is bound. Stop it, or change `PORT` / `POSTGRES_PORT` /
  `MINIO_PORT` / `MINIO_CONSOLE_PORT` in `.env`.
- **Health shows `storage: error` (bucket does not exist)** — the bucket isn't
  provisioned yet. Run `npm run db:seed` (see [docs/minio.md](docs/minio.md)).
- **Feature endpoints error (e.g. `relation "…" does not exist`) or the board is
  empty** — the schema or catalogs aren't loaded. Run `npm run db:migrate`, then
  `npm run db:seed`.
- **Backend can't reach the database/MinIO from the host** — start the
  dependencies (`docker compose up -d postgres minio`) and confirm `.env` uses
  `localhost`.
- **Stale data after config changes** — `npm run docker:reset:volumes` wipes the
  postgres/minio volumes for a clean slate (deletes local data); re-run
  `db:migrate` and `db:seed` afterward.
- **Rebuild after dependency changes** — `docker compose up --build` (or
  `npm run docker:up`) rebuilds the backend image.

## Documentation

- **[docs/frontend-guide.md](docs/frontend-guide.md) — start here to build the
  frontend.** The connecting model: how to stitch REST, WebSocket, auth, and the
  12-stage machine together, with end-to-end play scenarios. It links out to the
  references below rather than duplicating them.
- [docs/demo.md](docs/demo.md) — bring the backend up and play a full demo game
  end to end through REST/WS (no frontend), for showing the backbone off.
- [docs/realtime-events.md](docs/realtime-events.md) — the detailed WebSocket
  event catalog (names, directions, audiences, payloads).
- [docs/migrations-and-seeds.md](docs/migrations-and-seeds.md) — schema,
  migrations, and the seed flow.
- [docs/local-development.md](docs/local-development.md) — detailed local dev flow.
- [docs/minio.md](docs/minio.md) — MinIO console, bucket provisioning, and
  storage conventions.
- [docs/ci.md](docs/ci.md) — GitHub Actions pipeline (quality gate, E2E, optional
  Docker job).

## Known limitations

This is an **educational MVP** scoped to a single demo game room with a handful
of participants — not a hardened production service.

- **Public-read object storage.** The MinIO bucket is served via plain anonymous
  public URLs; no signed URLs, private buckets, CDN, or separate-origin serving.
  Stored-XSS is mitigated (uploads get a server-canonical `Content-Type` plus
  `Content-Disposition: attachment`), but the bucket is public by design. See
  [docs/minio.md](docs/minio.md#known-limitations).
- **In-memory presence and timers.** Socket presence and the answer / shop /
  presentation timers live in process memory, so they are lost on restart and
  assume a **single backend instance** (no horizontal scaling).
- **Educational auth.** There is no real authentication: hosts and players are
  identified by reconnect tokens, `FRONTEND_ORIGIN` / `WS_CORS_ORIGIN` default to
  `*`, and the MinIO credentials are well-known defaults. Lock these down before
  any shared or public environment.
- **No deployment.** No deploy jobs, hosting, or environment promotion —
  deferred until hosting is decided.

## Roadmap

- **Stages 1–10 — game backbone.** *Done.* Infrastructure and config, data layer
  (schema/migrations/seeds), lobby and team setup, game board and battle cycle,
  scoring, shop & QR tools, presentation upload, defense, evaluation, and final
  results — a full game from lobby to finished.
- **Stage 11 — documentation.** *Done.* Internal documentation (README and
  `docs/` brought in line with the implemented backbone), Swagger finalization
  (error envelope, file-picker, per-endpoint 4xx statuses), and a frontend
  integration guide ([docs/frontend-guide.md](docs/frontend-guide.md)).
- **Stage 12 — testing & hardening.** *Next.*

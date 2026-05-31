# Build Your Project Presentation — Backend

Backend for the educational real-time multiplayer game *"Своя игра: собери
презентацию проекта"*. NestJS + TypeScript, PostgreSQL + Drizzle, MinIO
(S3-compatible) storage, WebSocket (Socket.IO), and Swagger — REST and WebSocket
share a single backend process/URL.

This repository is **backend only**. There is no frontend here; the frontend is
an external consumer of the REST API, WebSocket events, and public file URLs.

> **Foundation stage.** The infrastructure skeleton is in place (config, health,
> database/storage seams, Swagger, base WebSocket gateway, Docker). There are
> **no game features, schema, migrations, or seeds yet** — those arrive in later
> stages (see [Roadmap](#roadmap)).

## Prerequisites

- **Node.js 22** (LTS) and **npm** (the repo uses `package-lock.json`).
- **Docker** and **Docker Compose v2** (`docker compose`, not `docker-compose`).

## Quick start (everything in Docker)

```bash
cp .env.example .env        # local-dev defaults work out of the box
npm run docker:up           # build + start backend, postgres, minio (detached)
```

Then verify:

| What | URL | Notes |
|---|---|---|
| Swagger UI | http://localhost:3000/docs | OpenAPI document for the REST surface |
| Health | http://localhost:3000/api/health | JSON report (see [Health](#health)) |
| MinIO console | http://localhost:9001 | login `minioadmin` / `minioadmin` |
| MinIO S3 API | http://localhost:9000 | used by the backend + public file URLs |

Stop everything:

```bash
npm run docker:down              # stop & remove containers (keeps data volumes)
npm run docker:reset:volumes     # also delete postgres + minio data (DESTRUCTIVE)
```

## Run the backend on the host (against Compose infra)

Useful for fast iteration with `--watch`. Start only the infrastructure in
Docker, then run the backend locally:

```bash
cp .env.example .env
docker compose up -d postgres minio     # just the dependencies
npm install
npm run start:dev                        # backend on the host, reads .env
```

The host `.env` points `DATABASE_URL` / `MINIO_ENDPOINT` at `localhost`, so this
works directly. Inside Compose those two are rewritten to the service names
`postgres` / `minio` — see [Host vs container](#host-vs-container).

## npm scripts

| Script | Purpose |
|---|---|
| `npm run start:dev` | Run backend on the host with reload |
| `npm run build` / `typecheck` / `lint` / `test` | Standard quality gates |
| `npm run docker:config` | Validate & print the resolved Compose config |
| `npm run docker:up` | Build images and start the full stack (detached) |
| `npm run docker:down` | Stop and remove containers (data volumes kept) |
| `npm run docker:logs` | Follow logs from all services |
| `npm run docker:reset:volumes` | `down -v` — removes containers **and data** |

## Verifying the stack

### Swagger

`http://localhost:3000/docs` serves the OpenAPI document. Today it contains the
title/description/version, the feature-area tags (Health, Game Session,
Gameplay, Commerce, Presentation, Evaluation, Realtime), and the shared error
response convention. Only the **Health** endpoint is implemented; feature
endpoints land with their stages.

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

> **Expected on a fresh stack:** `database` and `backend` are `ok`, but `storage`
> reports an error like `MinIO bucket "svoya-igra" does not exist`. The storage
> probe is read-only and never creates the bucket — bucket/asset provisioning is
> **Stage 5A**. See [docs/minio.md](docs/minio.md) for an optional one-liner to
> create the bucket now and turn storage green.

### WebSocket

A base Socket.IO gateway is mounted on the same process (path `/socket.io`). It
handles connect/disconnect and transport-level room grouping only — there are
**no game events yet**. The naming convention and the event contract seam live
in [docs/realtime-events.md](docs/realtime-events.md).

### PostgreSQL / MinIO

```bash
docker compose ps          # STATUS column shows (healthy) for postgres & minio
docker compose logs minio  # or postgres, to inspect a specific service
```

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
- **Health shows `storage: error` (bucket does not exist)** — expected on a
  fresh stack; create the bucket per [docs/minio.md](docs/minio.md) (Stage 5A
  will automate this).
- **Backend can't reach the database/MinIO from the host** — start the
  dependencies (`docker compose up -d postgres minio`) and confirm `.env` uses
  `localhost`.
- **Stale data after config changes** — `npm run docker:reset:volumes` wipes the
  postgres/minio volumes for a clean slate (deletes local data).
- **Rebuild after dependency changes** — `docker compose up --build` (or
  `npm run docker:up`) rebuilds the backend image.

## Documentation

- [docs/local-development.md](docs/local-development.md) — detailed local dev flow.
- [docs/minio.md](docs/minio.md) — MinIO console, bucket, and storage conventions.
- [docs/migrations-and-seeds.md](docs/migrations-and-seeds.md) — **placeholder**;
  schema/migrations/seeds are Stage 5A.
- [docs/realtime-events.md](docs/realtime-events.md) — WebSocket naming
  convention and event contract seam.

## Roadmap

- **Stage 3E** — basic GitLab CI (install → typecheck → lint → test → build →
  optional Docker build). *Not in this repository yet.*
- **Stage 5A** — Drizzle schema, versioned migrations, required static seeds, and
  the MinIO QR `.svg` placement procedure.
- **Stage 5B+** — Game Session, Gameplay, Commerce, Presentation, and Evaluation
  feature areas, plus their REST endpoints and WebSocket events.

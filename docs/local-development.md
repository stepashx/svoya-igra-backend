# Local development

Detailed companion to the [README](../README.md). Covers the Compose topology,
the environment variables, the two run modes, and cleanup.

## Prerequisites

- Node.js 22 (LTS) + npm.
- Docker + Docker Compose v2 (`docker compose ...`).

## Compose topology

`docker-compose.yml` defines three services on a shared bridge network
(`svoya-igra`) with persistent named volumes:

| Service | Image | Host ports | Volume | Health check |
|---|---|---|---|---|
| `backend` | built from `Dockerfile` | `3000` | — | liveness GET `/api/health` |
| `postgres` | `postgres:16-alpine` | `5432` | `pgdata` | `pg_isready` |
| `minio` | `minio/minio:RELEASE.2025-09-07T16-13-09Z` | `9000` (API), `9001` (console) | `miniodata` | `GET /minio/health/live` |

The backend starts only after `postgres` and `minio` report healthy
(`depends_on: condition: service_healthy`). Its own health check is a
**liveness** probe — any HTTP response counts as alive — so the container shows
healthy even while `/api/health` reports `storage` degraded, which it does until
`npm run db:seed` provisions the bucket (see
[migrations-and-seeds.md](migrations-and-seeds.md)).

Data survives `docker compose down`; it is removed only by
`docker compose down -v` (`npm run docker:reset:volumes`).

## Environment variables

All config flows through the typed Config module (`src/config`) and is validated
once at startup — the app refuses to boot on missing/invalid values, and nothing
reads `process.env` directly. Copy `.env.example` to `.env` and adjust.

The defaults are local-development only. Two variables are environment-specific
and `docker-compose.yml` overrides them for the in-Compose backend:

| Variable | Host value | In Compose backend | Reason |
|---|---|---|---|
| `DATABASE_URL` | `...@localhost:5432/...` | `...@postgres:5432/...` | reach DB by service name |
| `MINIO_ENDPOINT` | `localhost` | `minio` | reach MinIO by service name |
| `MINIO_PUBLIC_URL` | `http://localhost:9000` | unchanged | browser-facing link |

`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` provision the postgres
container and feed the backend's overridden `DATABASE_URL`; keep them consistent
with the host `DATABASE_URL`. `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` double as
the MinIO root credentials.

`NODE_ENV` is `development` for the host run mode, but `docker-compose.yml` sets
`NODE_ENV=production` for the in-Compose backend so it matches the runtime image
(which is built with production dependencies only). The MinIO image is pinned to
a dated `RELEASE.*` tag for reproducible local builds.

## Run mode A — everything in Docker

```bash
cp .env.example .env
npm run docker:up      # docker compose up --build -d (backend + postgres + minio)
npm install            # host tooling for the data-layer scripts
npm run db:migrate     # apply the schema (host → localhost)
npm run db:seed        # seed catalogs + provision the MinIO bucket (host → localhost)
docker compose ps      # postgres & minio should be (healthy)
npm run docker:logs    # follow logs (Ctrl-C to stop following)
```

`db:migrate` / `db:seed` run **on the host** against the Compose-published
`localhost` ports — they cannot run inside the backend container, whose image
ships production dependencies only (no `drizzle-kit` / `ts-node`). See
[migrations-and-seeds.md](migrations-and-seeds.md).

## Run mode B — backend on host, infra in Docker

Best for iterating on backend code with reload:

```bash
cp .env.example .env
docker compose up -d postgres minio
npm install
npm run db:migrate     # apply the schema
npm run db:seed        # seed catalogs + provision the MinIO bucket
npm run start:dev
```

The host `.env` already targets `localhost`, so no overrides are needed.
`db:migrate` / `db:seed` are one-time per fresh stack (and idempotent to re-run);
see [migrations-and-seeds.md](migrations-and-seeds.md).

## Verify

- Swagger: http://localhost:3000/docs
- Health: `curl -s http://localhost:3000/api/health` (200 = all reachable; 503 =
  a dependency is down or — before `db:seed` — the MinIO bucket is missing; see
  [minio.md](minio.md)).
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`).
- Service health: `docker compose ps`.

## Stop & clean up

```bash
npm run docker:down            # stop & remove containers, keep data
npm run docker:reset:volumes   # also delete pgdata + miniodata (DESTRUCTIVE)
docker compose build backend   # rebuild image after dependency changes
```

## What runs where

- **Schema & seeds** — `npm run db:migrate` then `npm run db:seed`, run on the
  host (the data-layer tooling is dev-only and absent from the backend image).
  See [migrations-and-seeds.md](migrations-and-seeds.md).
- **CI** — see [`ci.yml`](../.github/workflows/ci.yml) and [ci.md](ci.md):
  quality gate (typecheck → lint → build → test → schema-drift) plus a REST
  end-to-end job against live PostgreSQL + MinIO.
- **REST & WebSocket** — the game backbone is implemented (lobby → finished).
  The REST surface is browsable at Swagger `/docs`; realtime event contracts are
  in [realtime-events.md](realtime-events.md).
- **Deployment** — not here: deferred until hosting is chosen (see
  [README → Known limitations](../README.md#known-limitations)).

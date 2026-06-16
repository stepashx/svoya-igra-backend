# Continuous Integration (GitHub Actions)

The pipeline is defined in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It is the project's
**quality gate** for the backend: every push and pull request runs the same
checks a developer runs locally, plus an end-to-end suite against real
PostgreSQL and MinIO. There is intentionally **no deployment** — see
[Deferred](#deferred).

The workflow has three jobs:

- **`build`** — the required quality gate (typecheck · lint · build · unit tests
  · schema-drift guard). No services.
- **`e2e`** — REST end-to-end tests against live PostgreSQL + MinIO.
- **`docker`** — optional, manual-only image build.

## Triggers

The workflow runs on:

- **push** to `master`;
- **pull_request** targeting `master`;
- **workflow_dispatch** — a manual run from the repository's **Actions** tab.

Runs are grouped by ref with `cancel-in-progress`, so pushing a newer commit to
the same branch/PR cancels the in-flight run. The workflow token is read-only
(`permissions: contents: read`).

## Quality-gate job (`build`)

The required `build` job runs on `ubuntu-latest` and executes the same npm
scripts used locally, in order:

| Step | Command | Checks |
|---|---|---|
| Checkout | `actions/checkout@v4` | Fetch the repository |
| Setup Node | `actions/setup-node@v4` | Node from [`.nvmrc`](../.nvmrc), npm cache |
| Install | `npm ci --prefer-offline --no-audit --no-fund` | Reproducible install from the lockfile |
| Typecheck | `npm run typecheck` | TypeScript compiles with no errors |
| Lint | `npm run lint` | ESLint passes (`--max-warnings 0`, no auto-fix) |
| Build | `npm run build` | `nest build` produces `dist/` |
| Test | `npm test` | Jest unit tests pass |
| Schema drift | `npm run db:generate` | Migrations match the Drizzle schema (fails on any diff) |

`npm ci` **fails if `package.json` and `package-lock.json` are out of sync**, so
the install step doubles as a lockfile check. Node is pinned by `.nvmrc` (Node
22) through `setup-node`'s `node-version-file`, matching the project target and
the `Dockerfile`; `setup-node` also caches the npm download directory keyed by
the lockfile, so installs stay fast across runs.

The **schema-drift** step regenerates SQL from the TypeScript schema and fails
if anything under `migrations/` changes — that would mean the committed
migration drifted from the schema and must be regenerated (`npm run db:generate`
and commit). It runs **offline**: `db:generate` does not connect, so a dummy
`DATABASE_URL` is enough to satisfy config parsing. See
[migrations-and-seeds.md](migrations-and-seeds.md).

### No live services in this job

The quality gate's tests are **unit-level and mocked** — they do not require a
live PostgreSQL or MinIO, so the `build` job starts **no services**. The
database- and storage-backed checks run in the separate `e2e` job below.

## E2E job (`e2e`)

The `e2e` job runs the REST end-to-end suite (`npm run test:e2e`) against **real
PostgreSQL and MinIO**, exercising the full path through the schema and storage.

**PostgreSQL** runs as a GitHub Actions **service container** (`postgres:16`,
DB `svoya_igra`, user/password `postgres`/`postgres`, port `5432`) with a
`pg_isready` health check, so the job only proceeds once the database is
accepting connections.

**MinIO** runs as a **step** (`docker run … minio/minio:RELEASE.2025-09-07… server
/data`), not a service container. The reason: a service container cannot override
its image's command, and `minio/minio` with no command just prints help and
exits — so MinIO is launched as a step where `server /data` can be passed
(mirroring `docker-compose.yml`). Its root credentials are sourced from the job's
`MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` so the server's root user equals the keys
the app and seed authenticate with. A follow-up step polls
`/minio/health/live` until MinIO is ready.

The job's `env` block points the app and the data-layer scripts at these
services (`DATABASE_URL` → `localhost:5432`, `MINIO_ENDPOINT=localhost`,
`MINIO_PORT=9000`, bucket `svoya-igra`, path-style). Steps then run, in order:

| Step | Command | What it does |
|---|---|---|
| Apply migrations | `npm run db:migrate` | Create the schema in the service PostgreSQL |
| Seed catalogs (and MinIO bucket) | `npm run db:seed` | Validate catalogs, provision the bucket + QR SVGs, upsert catalogs |
| E2E tests | `npm run test:e2e` | Run the REST end-to-end suite |

This is the same host-side `db:migrate` → `db:seed` flow developers run locally
(see [migrations-and-seeds.md](migrations-and-seeds.md)) — CI proves it works
end to end on a clean machine.

## Optional Docker job (`docker`)

The `docker` job validates that the backend image still builds from the
`Dockerfile`. It:

- runs **only** on a manual `workflow_dispatch`
  (`if: github.event_name == 'workflow_dispatch'`), never on push or pull
  request;
- is `continue-on-error: true`, so it never blocks the workflow result;
- runs `docker build -t svoya-igra-backend:ci .` and **never pushes** the image
  to any registry.

If you don't need the image check, simply ignore this job — the quality gate and
E2E job are the gates that run on every push and PR.

## Deferred

- **Deployment** — no deploy jobs, environment promotion, registry pushes, or
  hosting-specific scripts. Deployment is deferred until hosting is decided
  (master-context open questions 6–7).

# Continuous Integration (GitLab CI)

The pipeline is defined in [`.gitlab-ci.yml`](../.gitlab-ci.yml). It is a
**foundation quality gate** for the backend: every push/merge request installs
dependencies reproducibly and runs the same checks a developer runs locally.
There is intentionally **no deployment** — see [Deferred](#deferred).

## Pipeline stages

Jobs run in this order; each runs one npm script (the same one used locally):

| Stage | Job | Checks | Local equivalent |
|---|---|---|---|
| `install` | `install` | Reproducible install from the lockfile | `npm ci` |
| `typecheck` | `typecheck` | TypeScript compiles with no errors | `npm run typecheck` |
| `lint` | `lint` | ESLint passes (`--max-warnings 0`, no auto-fix) | `npm run lint` |
| `test` | `test` | Jest unit tests pass (DB-free; the integration spec self-skips) | `npm test` |
| `db-checks` | `db-checks` | Migrations apply to a real PostgreSQL service, seeds load, constraints enforced | `npm run db:migrate && npm run db:seed && npm run db:test:integration` |
| `build` | `build` | `nest build` produces `dist/` | `npm run build` |
| `docker` | `docker-build` | Backend image builds from `Dockerfile` (**optional/manual**) | `docker build .` |

`install` uses `npm ci`, so the job **fails if `package.json` and
`package-lock.json` are out of sync**. The Node image (`node:22-alpine`) matches
the project's Node 22 target and the `Dockerfile`.

## Cache & artifacts

- **Cache:** npm's download cache (`.npm/`) is cached across pipelines, keyed by
  `package-lock.json`, so installs are fast and reproducible.
- **Artifacts:** `install` publishes `node_modules/` as a short-lived (1 h)
  artifact that `typecheck` / `lint` / `test` / `build` reuse — dependencies are
  installed once per pipeline, not per job. `build` publishes `dist/` (1 h).
  `node_modules/` is never committed.

## Optional Docker build job

`docker-build` validates that the backend image still builds from the
`Dockerfile`. It is **manual** and `allow_failure: true`, and uses
Docker-in-Docker, so:

- it does not run automatically and never blocks the pipeline;
- it works only on a runner with a Docker-in-Docker executor;
- it **never pushes** the image to any registry.

If your runners don't provide Docker-in-Docker, simply ignore this job (or remove
it) — the Node checks above are the required gate.

## Data-layer checks (`db-checks`)

The `db-checks` job runs the data layer against a **real, disposable**
PostgreSQL `service` (`postgres:16-alpine`): it applies the committed migrations
to an empty database, loads the required static seeds, and runs the gated
integration spec (which also enforces the key unique/FK constraints). It is the
data-layer equivalent of the unit gate above and is described in full in
[data-layer-tests.md](data-layer-tests.md).

It needs **no external network and no MinIO** — the seed composes QR metadata
from config, so a standard postgres service is the only dependency (reliable, not
brittle). The integration spec keys on `DATABASE_TEST_URL`, which this job sets to
the service DB; in the regular `test` job that variable is unset, so the spec
self-skips and that job stays DB-free.

## Deferred

- **Deployment** — no deploy jobs, environment promotion, registry pushes, or
  hosting-specific scripts. Deployment is deferred until hosting is decided
  (master-context open questions 6–7).
- **Live MinIO in CI** — verifying QR `.svg` objects against a real MinIO
  (`npm run db:verify:qr-assets`) stays a **local/manual** step; CI does not
  depend on object storage. The DB-free QR contract tests still run in `npm test`.

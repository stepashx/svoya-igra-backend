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
| `test` | `test` | Jest unit tests pass | `npm test` |
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

## Deferred

- **Deployment** — no deploy jobs, environment promotion, registry pushes, or
  hosting-specific scripts. Deployment is deferred until hosting is decided
  (master-context open questions 6–7).
- **Migrations / seeds** — not part of CI. The data layer (Drizzle schema,
  migrations, seeds) arrives in **Stage 5A**; see
  [migrations-and-seeds.md](migrations-and-seeds.md).
- **Integration tests** — default CI tests are unit-level and mocked; they do
  **not** require live PostgreSQL/MinIO. Integration tests against real services
  may be added in a later stage as an opt-in job.

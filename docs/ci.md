# Continuous Integration (GitHub Actions)

The pipeline is defined in
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml). It is a **foundation
quality gate** for the backend: every push and pull request runs the same checks
a developer runs locally, so "green in CI" means "green on a developer machine".
There is intentionally **no deployment** — see [Deferred](#deferred).

## Triggers

The workflow runs on:

- **push** to `master`;
- **pull_request** targeting `master`;
- **workflow_dispatch** — a manual run from the repository's **Actions** tab.

Runs are grouped by ref with `cancel-in-progress`, so pushing a newer commit to
the same branch/PR cancels the in-flight run. The workflow token is read-only
(`permissions: contents: read`).

## Quality-gate job

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

`npm ci` **fails if `package.json` and `package-lock.json` are out of sync**, so
the install step doubles as a lockfile check. Node is pinned by `.nvmrc` (Node
22) through `setup-node`'s `node-version-file`, matching the project target and
the `Dockerfile`; `setup-node` also caches the npm download directory keyed by
the lockfile, so installs stay fast across runs.

### No database or storage in CI

The default tests are **unit-level and mocked** — they do **not** require a live
PostgreSQL or MinIO. CI therefore starts **no service containers**: the quality
gate needs only Node and the lockfile. Integration tests against real services
may be added later as an opt-in job (see [Deferred](#deferred)).

## Optional Docker job

The `docker` job validates that the backend image still builds from the
`Dockerfile`. It:

- runs **only** on a manual `workflow_dispatch`
  (`if: github.event_name == 'workflow_dispatch'`), never on push or pull
  request;
- is `continue-on-error: true`, so it never blocks the workflow result;
- runs `docker build -t svoya-igra-backend:ci .` and **never pushes** the image
  to any registry.

If you don't need the image check, simply ignore this job — the quality gate
above is the required gate.

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

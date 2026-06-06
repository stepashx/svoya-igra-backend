# Migrations & Seeds

> **Status (Stage 5A.5): migrations implemented; seeds not yet.** The full
> 16-table Drizzle schema and its initial versioned migration exist and apply
> cleanly to an empty database. **Seeds are intentionally NOT part of Stage
> 5A.5** — there are no seed scripts, no static seed data, and no QR/MinIO asset
> placement procedure yet. Those arrive in a later sub-stage.

## What exists now

- The complete Drizzle schema (all 16 MVP tables) under
  [`src/infrastructure/database/schema`](../src/infrastructure/database/schema),
  grouped by feature area with a shared enum/status area.
- Drizzle Kit configuration at [`drizzle.config.ts`](../drizzle.config.ts).
- The initial generated migration under
  [`src/infrastructure/database/migrations`](../src/infrastructure/database/migrations)
  (SQL + the `meta/` journal), which Infrastructure owns alongside the schema.
- Two npm scripts: `db:generate` and `db:migrate`.

## Required environment variables

Both scripts read configuration from the local `.env` (loaded by
`drizzle.config.ts` via `dotenv`). Only one variable is needed for migrations:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used to apply migrations (and the `dbCredentials` for `drizzle-kit migrate`). |

Copy the template once before running anything:

```bash
cp .env.example .env
```

`DATABASE_URL` defaults to `postgres://postgres:postgres@localhost:5432/svoya_igra`,
matching the Docker Compose `postgres` service. (MinIO variables are unrelated to
migrations and are not required here — they matter only once seeds/uploads land.)

## How to generate a migration

After changing any schema file under
`src/infrastructure/database/schema`, regenerate the migration SQL from the
current schema:

```bash
npm run db:generate
```

This writes a new timestamped/sequence-prefixed SQL file plus an updated journal
snapshot under `src/infrastructure/database/migrations`. Review the generated SQL
and commit it together with the schema change. The initial migration
(`0000_*.sql`) already covers all 16 tables, so you only run this for *new*
changes.

## How to apply migrations locally

1. Start PostgreSQL (the whole stack, or just the database):

   ```bash
   npm run docker:up          # backend + postgres + minio
   # or, database only:
   docker compose up -d postgres
   ```

2. Apply all pending migrations:

   ```bash
   npm run db:migrate
   ```

`db:migrate` is **idempotent** — re-running it when everything is already applied
is a no-op (Drizzle tracks applied migrations in its `drizzle.__drizzle_migrations`
journal table).

## Applying to an empty database / resetting locally

There is no dedicated reset script in this sub-stage (a guarded reset belongs with
the seed work). To verify migrations against a genuinely empty database, drop the
Compose volume and re-apply — safe because all data here is reproducible:

```bash
npm run docker:reset:volumes   # docker compose down -v  (drops the pgdata volume)
docker compose up -d postgres
npm run db:migrate             # recreates all 16 tables from scratch
```

This is exactly how the migration was verified for Stage 5A.5: from 0 tables to
all 16, with 27 foreign keys and 17 unique constraints, no ordering errors.

## Seeds — explicitly out of scope for Stage 5A.5

No seeds, seed scripts, static/demo seed data, or QR/MinIO asset placement are
part of this sub-stage. The required static seeds (6 categories, 30 questions
with backend-only answers, presentation topics, QR-tool metadata, shop items,
presentation requirements, evaluation criteria), optional demo seeds, and the
MinIO `.svg` placement procedure are deliberately deferred. Until they land,
`storage` health stays red until the bucket is created manually (see
[minio.md](minio.md)), and the database simply contains the empty schema.

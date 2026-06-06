# Migrations & Seeds

> **Status (Stage 5A.7): migrations, required static seeds, and QR `.svg`
> placement implemented.** The full 16-table Drizzle schema applies cleanly to an
> empty database, the required static catalog seeds (categories, questions,
> presentation topics, QR-tool metadata, shop items, presentation requirements,
> evaluation criteria) apply idempotently on top, and the QR `.svg` objects are
> placed into MinIO and verified by a dedicated procedure (see
> [qr-assets.md](qr-assets.md)). Runtime tables are never seeded (see below).

## What exists now

- The complete Drizzle schema (all 16 MVP tables) under
  [`src/infrastructure/database/schema`](../src/infrastructure/database/schema),
  grouped by feature area with a shared enum/status area.
- Drizzle Kit configuration at [`drizzle.config.ts`](../drizzle.config.ts).
- The initial generated migration under
  [`src/infrastructure/database/migrations`](../src/infrastructure/database/migrations)
  (SQL + the `meta/` journal).
- The required static seeds under
  [`src/infrastructure/database/seeds`](../src/infrastructure/database/seeds)
  (see that folder's [README](../src/infrastructure/database/seeds/README.md)).
- npm scripts: `db:generate`, `db:migrate`, `db:seed`, plus the QR procedure
  `db:seed:qr-assets` and `db:verify:qr-assets` (see
  [qr-assets.md](qr-assets.md)).

## Required order: `migrate → seed → place QR assets → verify QR assets`

Seeds insert rows into tables, so the schema must exist first; QR placement backs
the seeded QR metadata with objects, so it runs after the seed. **Always run in
this order:**

```bash
npm run db:migrate          # 1. create/upgrade the schema
npm run db:seed             # 2. load the required static catalog data
npm run db:seed:qr-assets   # 3. place QR .svg objects in MinIO
npm run db:verify:qr-assets # 4. verify QR metadata ↔ objects
```

Every step is idempotent (see below), so the sequence is safe to re-run. Steps
3–4 need a reachable MinIO; steps 1–2 need only PostgreSQL.

## Required environment variables

All three scripts read configuration from the local `.env` (loaded via
`dotenv`). They are CLI tooling, so — like `drizzle.config.ts` — they read env
directly rather than through the app's typed Config module.

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | migrate, seed | PostgreSQL connection string. |
| `MINIO_BUCKET` | seed | Bucket recorded in QR-tool metadata. |
| `MINIO_PUBLIC_URL` | seed | Base URL used to compose QR `publicUrl`. |
| `MINIO_PATH_STYLE` | seed | Path-style vs virtual-hosted URL shape (defaults to `true`). |

> The seed reads the MinIO variables only to **compose** QR-tool metadata
> (`bucket`, `storageKey`, `publicUrl`). It does **not** connect to MinIO and
> does **not** upload any `.svg` object.

Copy the template once before running anything:

```bash
cp .env.example .env
```

`DATABASE_URL` defaults to `postgres://postgres:postgres@localhost:5432/svoya_igra`,
matching the Docker Compose `postgres` service.

## How to generate a migration

After changing any schema file under `src/infrastructure/database/schema`,
regenerate the migration SQL:

```bash
npm run db:generate
```

This writes a new timestamped SQL file plus an updated journal snapshot. Review
the generated SQL and commit it with the schema change.

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

`db:migrate` is idempotent — re-running when everything is applied is a no-op.

## How to run seeds locally

With migrations applied and `.env` in place:

```bash
npm run db:seed
```

The script applies every required static dataset in dependency order
(reference/catalog tables before their dependents — the same order as the
migrations), then reads back and **verifies the row counts**, printing a summary:

```
Required static seeds applied. Verified counts:
  categories: 6 (expected 6)
  questions: 30 (expected 30)
  presentationTopics: 8 (expected 8)
  qrTools: 6 (expected 6)
  shopItems: 6 (expected 6)
  presentationRequirements: 6 (expected 6)
  evaluationCriteria: 2 (expected 2)
```

If any count does not match its expected value, the script exits non-zero with a
clear message.

### Idempotency

Every seeded row has a **stable id** and is written with an upsert on the primary
key (`ON CONFLICT (id) DO UPDATE`). Re-running `db:seed`:

- never creates duplicates (counts stay fixed);
- refreshes catalog content in place if a seed definition changed;
- preserves existing runtime data — catalog rows are **updated, never deleted**,
  so foreign keys from any runtime rows (purchases → shop items, board cells →
  questions, etc.) remain valid.

So `db:seed` is safe to run repeatedly, on a clean database or a populated one.

## Clean-database expectation

On a genuinely empty database the flow is simply:

```bash
docker compose up -d postgres
npm run db:migrate     # 0 → 16 tables
npm run db:seed        # loads the required static catalogs
```

To verify against a truly empty database (or reset locally — safe because all
data here is reproducible), drop the Compose volume and re-apply:

```bash
npm run docker:reset:volumes   # docker compose down -v
docker compose up -d postgres
npm run db:migrate
npm run db:seed
```

## Runtime tables are NOT seeded

Seeds load **only static catalog tables**. The following runtime tables are
created by gameplay and **must never be seeded in normal operation**:

```
rooms, players, teams, board_cells, purchases, inventory_items,
presentation_submissions, evaluation_scores, final_results
```

There is **no demo/runtime seed** in this sub-stage. The seed runner writes none
of these tables, and a post-seed inspection of a fresh database shows them all
empty.

## QR `.svg` placement (Stage 5A.7)

The seed records QR-tool **metadata** with a global `storageKey`
(`qr-tools/<qrToolId>.svg`, no `roomId`) and a composed `publicUrl` but uploads no
bytes, so those `publicUrl`s do not resolve until the objects are placed. The QR
procedure closes that gap:

```bash
npm run db:seed:qr-assets    # ensures the bucket + uploads the QR .svg objects
npm run db:verify:qr-assets  # verifies metadata ↔ objects consistency
```

`db:seed:qr-assets` also creates the bucket (with a public-read policy) if it is
missing, so it turns `storage` health green. See [qr-assets.md](qr-assets.md) for
the asset location, env vars, and what remains out of scope.

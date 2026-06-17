# Migrations & Seeds

The data layer is implemented. PostgreSQL holds the relational state and MinIO
holds the file bytes; both are provisioned by two npm scripts you run **on the
host**, in order:

```bash
npm run db:migrate   # 1. create the schema in PostgreSQL
npm run db:seed      # 2. load the static catalogs + provision the MinIO bucket
```

Run them once against a fresh stack, and re-run either at any time — both are
idempotent (see [Idempotency](#idempotency)).

> **Prerequisites.** PostgreSQL and MinIO must be reachable and `.env` must
> exist. The usual local setup is `cp .env.example .env` then
> `docker compose up -d postgres minio` (see
> [local-development.md](local-development.md)). Both scripts read connection
> settings straight from `.env`, so the defaults target `localhost`.

> **Why on the host.** `db:migrate` runs `drizzle-kit` and `db:seed` runs under
> `ts-node` — both are **dev dependencies**. The runtime Docker image installs
> production dependencies only (`npm ci --omit=dev`), so neither tool exists
> inside the backend container. The scripts run on the host and connect to the
> Compose-published `localhost` ports. CI does exactly this: its E2E job runs
> `db:migrate` then `db:seed` against service-container PostgreSQL/MinIO before
> the tests (see [ci.md](ci.md)).

## Schema & migrations

The Drizzle schema lives in `src/infrastructure/database/schema/`, grouped by
feature area (`game-session`, `gameplay`, `commerce`, `presentation`,
`evaluation`, plus `_shared` enums/columns). It compiles to a single committed
migration:

```
src/infrastructure/database/migrations/0000_wild_enchantress.sql
```

That migration creates **16 tables** across the five areas:

| Area | Tables |
|---|---|
| `game-session` | `rooms`, `teams`, `players`, `presentation_topics` |
| `gameplay` | `categories`, `questions`, `board_cells` |
| `commerce` | `qr_tools`, `shop_items`, `purchases`, `inventory_items` |
| `presentation` | `presentation_requirements`, `presentation_submissions` |
| `evaluation` | `evaluation_criteria`, `evaluation_scores`, `final_results` |

Migration scripts:

| Script | Tool | What it does |
|---|---|---|
| `npm run db:migrate` | `drizzle-kit migrate` | Apply pending migrations to the database in `DATABASE_URL`. |
| `npm run db:generate` | `drizzle-kit generate` | Regenerate SQL from the TypeScript schema. **Offline** — does not connect. |
| `npm run db:check` | `drizzle-kit check` | Validate the migration journal is consistent. |

When you change the schema, run `db:generate` and commit the regenerated SQL.
**CI enforces this:** the quality-gate job re-runs `db:generate` and fails if it
produces any diff under `migrations/` — i.e. the committed migration drifted
from the schema (see [ci.md](ci.md)).

## Seeds

`npm run db:seed` runs `src/infrastructure/database/seeds/seed.ts`. In one pass
it validates the catalog JSON, provisions MinIO, then upserts the catalogs into
PostgreSQL:

1. **Validate** the seven JSON files under
   `src/infrastructure/database/seeds/data/`. Validation is two-layer: per-file
   `zod` schemas pin each row's shape and the plan-mandated counts, and a
   relational pass checks cross-file invariants (no duplicate IDs across
   catalogs; each category holds exactly the five canonical price tiers
   100/200/400/600/800 at positions 0–4; a strict 1:1 shop-item ↔ QR-tool
   pairing with no orphans; both required evaluation-criteria titles present). A
   malformed or inconsistent file aborts with one aggregated error **before any
   write** — never a partial seed.
2. **Provision MinIO**: create the bucket if it is absent, apply the
   anonymous public-read policy, and upload one placeholder QR `.svg` per
   `qr_tool` (so every seeded `storageKey` / `publicUrl` resolves to a real
   object). See [minio.md](minio.md).
3. **Upsert the catalogs** into PostgreSQL inside a single transaction, ordered
   so foreign keys resolve (`categories → questions`, `qr_tools → shop_items`;
   topics / requirements / criteria are independent).

Seeded rows (exact counts, fixed by the JSON files):

| Catalog (table) | Rows |
|---|---|
| `categories` | 6 |
| `questions` | 30 |
| `presentation_topics` | 4 |
| `qr_tools` | 6 |
| `shop_items` | 6 |
| `presentation_requirements` | 4 |
| `evaluation_criteria` | 2 |

Plus **6 placeholder QR SVGs** (one per `qr_tool`) uploaded to MinIO.

Notes:

- **Seven of the sixteen tables are seeded** — the static catalogs above. The
  other nine (`rooms`, `teams`, `players`, `board_cells`, `purchases`,
  `inventory_items`, `presentation_submissions`, `evaluation_scores`,
  `final_results`) are **runtime** tables created and written as a game is
  played; the seed never touches them.
- **Question correct answers and point values are backend-only** catalog data.
  They live in `questions` and are never exposed to clients through the board /
  question read models.
- **QR SVGs are placeholders**, not real QR codes — a valid, bordered stand-in
  with a centered label so the storage pipeline has real objects to serve. Drop
  in real artwork by replacing the assets and re-running the seed.

## Idempotency

Every step is safe to re-run; nothing is duplicated:

- **Catalogs** upsert on their primary key (`ON CONFLICT (id) DO UPDATE`). A
  second run refreshes the JSON-derived columns in place. `created_at` is
  excluded from the update set, so the original timestamp is preserved.
- **Bucket** is created only when absent (`bucketExists` first); the public-read
  policy is re-applied each run (a no-op when already set).
- **QR SVGs** are written under deterministic keys (`qr-tools/<qrToolId>.svg`),
  so a re-run overwrites the same object rather than adding a new one.

Net effect: re-running `db:seed` refreshes the catalogs and assets to match the
JSON, and never produces duplicate rows or orphaned objects.

## Order & when to run

- **Fresh stack:** `db:migrate`, then `db:seed`. The seed expects the tables to
  exist.
- **After pulling schema changes:** `db:migrate` to apply new migrations. Re-run
  `db:seed` if the catalog JSON changed.
- **After editing catalog JSON:** `db:seed` again — the upsert refreshes the
  affected rows.
- A successful seed turns `GET /api/health` `storage` green: the bucket now
  exists (the storage probe checks exactly that).

## Troubleshooting

- **`db:migrate` / `db:seed`: connection refused (ECONNREFUSED)** — PostgreSQL
  or MinIO is not up, or `.env` points somewhere unreachable. Start the infra
  (`docker compose up -d postgres minio`) and confirm `.env` uses `localhost`.
- **`Missing required environment variable …`** — `.env` is absent or
  incomplete. Run `cp .env.example .env`. The seed reads `DATABASE_URL`,
  `MINIO_*`, and friends directly.
- **Schema-drift failure in CI (`db:generate` produced a diff)** — you changed
  the schema without regenerating. Run `npm run db:generate` locally and commit
  the updated `migrations/` output.
- **`Seed data … validation failed` / `relational validation failed`** — a
  catalog JSON file is malformed or breaks an invariant (wrong row count, a
  price tier off, an orphaned shop item / QR tool). The aggregated error lists
  every violation; fix the JSON and re-run.
- **Re-seeding after edits doesn't change anything unexpected** — that's the
  upsert working as intended: existing rows are refreshed by `id`, `created_at`
  is preserved, and no rows are duplicated.

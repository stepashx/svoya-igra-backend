# Data-layer tests & verification (Stage 5A.8)

> **Status (Stage 5A.8): data-layer verification, scripts, CI, and docs
> polished.** This sub-stage adds the tests that prove the Stage 5A data layer
> (schema, migrations, seeds, QR placement) behaves as the planning docs fix —
> without implementing any Stage 5B/6 feature behaviour.

Stage 5A is **only the physical data foundation**: Drizzle schema, migrations,
required static seeds, and the QR `.svg` placement procedure. No feature
behaviour — no use cases, repositories, REST/WebSocket endpoints, or gameplay —
exists yet. **Stage 5B (Game Session) is not implemented.**

## Two layers of checks

The data layer is verified at two levels so the common, fast checks run
everywhere and the expensive, real-infrastructure checks run on demand.

### 1. DB-free checks — run in every `npm test` / CI

These need no PostgreSQL or MinIO; they introspect the schema, the committed
migration SQL, and the seed datasets directly.

| Spec | What it proves |
|---|---|
| [`schema/schema-structure.spec.ts`](../src/infrastructure/database/schema/schema-structure.spec.ts) | The exact **16 MVP tables** exist; key **unique constraints** and **foreign keys** are declared; the intentional `board_cells` snapshot (`category_id`/`points`) is kept; and every **forbidden** element stays absent — no `hosts`/`files` table, no `players.is_captain`, no purchase-state on `shop_items`, no `assignedTeamId`/`presentationSubmissionId`, and the polymorphic `evaluatorId` is **not** an FK. |
| [`migrations/migration-consistency.spec.ts`](../src/infrastructure/database/migrations/migration-consistency.spec.ts) | The **committed migration SQL covers the schema** — every table has a `CREATE TABLE`, every declared unique/FK appears in the SQL, the journal references each migration, and no forbidden table/column leaked in. Catches "edited the schema, forgot to regenerate the migration" drift. |
| [`seeds/required-seed-data.spec.ts`](../src/infrastructure/database/seeds/required-seed-data.spec.ts) | Required-seed **structure**: 6 categories; 30 questions (five per category at 100/200/400/600/800, each with a backend-only answer); topics ≥ team count; **shop ↔ QR one-to-one count consistency**; requirements contiguously ordered; the two 0–10 evaluation criteria. |
| [`storage/qr-assets/*.spec.ts`](../src/infrastructure/storage/qr-assets) | QR placement/verification **contract** against in-memory fakes: one SVG object per seeded tool, **global keys** (`qr-tools/<id>.svg`, no `roomId`), metadata-consistency passes when backed and fails clearly on a missing/drifted object. |

The canonical 16-table inventory shared by these checks lives in
[`data-layer.tables.ts`](../src/infrastructure/database/data-layer.tables.ts).

Run just the data-layer specs:

```bash
npm run db:test
```

### 2. Environment-gated integration check — real PostgreSQL

[`data-layer.integration.spec.ts`](../src/infrastructure/database/data-layer.integration.spec.ts)
runs against a **real, disposable** PostgreSQL and proves end-to-end:

- the committed migrations **apply to an empty database** and produce exactly the
  16 tables (no forbidden ones);
- the required static seeds run **idempotently** with the expected counts, and
  every **runtime table stays empty**;
- the key **unique constraints are enforced** (duplicate room code, player
  reconnect token, `(roomId, name)`, `(roomId, selectedTopicId)`; NULL topics
  coexist) and **foreign keys are enforced** (orphan question/shop item rejected).

Every runtime row it inserts is written inside a transaction that is **always
rolled back**, so it leaves no rooms/players/teams behind — only the idempotent
static catalog seeds persist (expected on a disposable test DB).

It is **skipped unless `DATABASE_TEST_URL` is set**, so the default `npm test`
stays DB-free and green. To run it locally against a throwaway database:

```bash
docker compose up -d postgres
docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE svoya_igra_test;"
DATABASE_TEST_URL="postgres://postgres:postgres@localhost:5432/svoya_igra_test" \
  npm run db:test:integration
# when done:
docker compose exec -T postgres psql -U postgres -c "DROP DATABASE svoya_igra_test;"
```

MinIO is **not** required here — the seed composes QR metadata from config
without object storage. Verifying QR objects against a **live MinIO** stays a
local/manual step (`npm run db:verify:qr-assets`).

## CI

The GitLab `db-checks` job (see [ci.md](ci.md) and
[`.gitlab-ci.yml`](../.gitlab-ci.yml)) spins up a `postgres:16-alpine` **service**
and runs `db:migrate` → `db:seed` → `db:test:integration`. It needs no external
network and no MinIO, so it is reliable rather than brittle.

## Complete local Stage 5A workflow

```bash
docker compose up -d postgres minio   # dependencies
npm run db:migrate                     # 1. schema (migrations BEFORE seeds)
npm run db:seed                        # 2. required static catalogs (+ verifies counts)
npm run db:seed:qr-assets              # 3. place QR .svg objects (seeds BEFORE QR placement)
npm run db:verify:qr-assets            # 4. verify QR metadata ↔ objects
npm test                               # data-layer + unit checks
```

`npm run db:verify` runs steps 1–4 in one command.

## Stage 5A data-layer acceptance checklist

- [x] Migrations apply to an empty PostgreSQL database (gated integration test +
      `db-checks` CI job).
- [x] All **16 MVP tables** exist after migration; no forbidden `hosts`/`files`.
- [x] Key **foreign keys** exist (schema introspection + migration SQL + live DB).
- [x] Key **unique constraints** exist and are **enforced** (introspection +
      migration SQL + live duplicate-rejection).
- [x] **No schema drift** between the Drizzle schema and the committed migration
      (migration-consistency spec).
- [x] Required static seeds load with the expected counts — **categories = 6**,
      **questions = 30** — and the board shape (6×5, one question per value per
      category) holds.
- [x] **QR metadata count consistency** and **shop item ↔ QR tool** one-to-one
      linkage; requirements ordering; criteria ordering/ranges (0–10).
- [x] **QR metadata-to-storage-key consistency** verified (DB-free contract tests
      + the live `db:verify:qr-assets` procedure).
- [x] **Runtime tables are never seeded** in normal operation; the only runtime
      rows in tests are transaction-rolled-back.
- [x] **Migrations run before seeds; seeds run before QR placement** (documented
      and enforced by the required order).
- [x] **No Stage 5B/6 behaviour, REST/WS endpoints, or repository adapters** were
      added — Stage 5A is only the physical data foundation.

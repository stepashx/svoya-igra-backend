# Migrations & Seeds — placeholder (Stage 5A)

> **Status: not implemented yet.** There is **no schema, there are no
> migrations, and there are no seed files** in this repository. The database
> layer is wired as a connection/transaction seam only (Drizzle client +
> `SELECT 1` health probe). This document is a placeholder so the intended local
> flow is clear before the data layer exists.

Do not expect any `db:*`, `migrate`, or `seed` npm scripts yet — they are
deliberately absent. Adding fake commands that do nothing would be misleading.

## What Stage 5A will add

- Drizzle schema files grouped by feature area, with a shared enums/status area.
- Versioned migrations in dependency order (shared enums → reference tables →
  dependents → session tables → per-room runtime tables).
- Required **static seeds**: 6 categories, 30 questions (with backend-only
  correct answers and values), presentation topics, QR tools metadata, shop
  items, presentation requirements, and evaluation criteria.
- The **MinIO QR `.svg` placement** procedure so seeded `storageKey`/`publicUrl`
  values resolve to real objects (see [minio.md](minio.md)).
- Optional demo-only seeds (safe to omit).
- Migration/seed invocation scripts and data-layer tests.

## Intended local flow (once Stage 5A lands)

1. `npm run docker:up` — start backend, PostgreSQL, and MinIO.
2. Apply migrations *(Stage 5A command — TBD)*.
3. Run required static seeds *(Stage 5A command — TBD)*.
4. Place / verify QR `.svg` assets in MinIO *(Stage 5A procedure)*.
5. Optionally run demo seeds.
6. Confirm `GET /api/health` reports `storage: ok` (bucket present) and the
   seed-count / QR-metadata checks pass.

Until then, `database` health only confirms PostgreSQL is reachable, and
`storage` health stays red until the bucket is created manually (see
[minio.md](minio.md)).

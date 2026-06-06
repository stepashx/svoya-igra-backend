# QR assets (MinIO placement & verification)

> **Status (Stage 5A.7): QR `.svg` placement and verification implemented.** The
> seeded `qr_tools` catalog records storage *metadata* (Stage 5A.6); this
> sub-stage adds the procedure that places the matching `.svg` objects into MinIO
> and verifies the catalog is internally consistent and fully backed.

**Data model (unchanged):** PostgreSQL stores QR *metadata only*; MinIO stores
the QR `.svg` bytes. `qr_tools` is a global/static catalog, so its `storageKey`
is global and carries **no `roomId`**: `qr-tools/<qrToolId>.svg`. The MVP storage
model stays public: a public-read bucket and plain public URLs — **no signed
URLs, no private buckets, no CDN.**

## Where the assets live

Committed `.svg` files: [`src/infrastructure/storage/qr-assets/assets`](../src/infrastructure/storage/qr-assets/assets),
named by each QR tool's `payload` slug (`<payload>.svg`, e.g. `fifty-fifty.svg`).
The storage key is always derived from the tool **id**
(`qr-tools/<qrToolId>.svg`), so the local file name and the DB/MinIO contract are
decoupled — the mapping is computed from `QR_TOOL_SEEDS` in
[`qr-asset-source.ts`](../src/infrastructure/storage/qr-assets/qr-asset-source.ts).

> The shipped files are **deterministic MVP placeholders** (a labelled frame, not
> a scannable QR code). Replace them with real QR `.svg`s before production,
> keeping the same `<payload>.svg` file names; then re-run placement + verify.

If a seeded tool has no matching `.svg`, placement **fails clearly** naming the
expected path — the procedure never invents artwork at runtime.

## Required order

QR placement runs **after** the schema and seeds exist:

```bash
npm run db:migrate          # 1. schema
npm run db:seed             # 2. QR metadata (+ the rest of the static catalog)
npm run db:seed:qr-assets   # 3. place QR .svg objects in MinIO
npm run db:verify:qr-assets # 4. verify metadata ↔ objects consistency
```

All four are idempotent and safe to re-run.

## How placement works (`db:seed:qr-assets`)

[`place-qr-assets.ts`](../src/infrastructure/storage/qr-assets/place-qr-assets.ts)
connects to **MinIO only** (it does not touch the database) and:

1. **Ensures the bucket** exists — creating it if missing (the storage health
   probe never creates it) and applying an anonymous **download** policy so
   public URLs resolve without signed URLs.
2. **Uploads** each seeded QR `.svg` to `qr-tools/<qrToolId>.svg` with
   `Content-Type: image/svg+xml`, overwriting any existing object.

## How verification works (`db:verify:qr-assets`)

[`verify-qr-assets.ts`](../src/infrastructure/storage/qr-assets/verify-qr-assets.ts)
reads **both** the database and MinIO and, for every `qr_tools` row, checks:

- the seeded metadata is internally consistent with config — `storageProvider`,
  `bucket`, `storageKey` (the global `qr-tools/<id>.svg`, no `roomId`),
  `publicUrl`, and `fileFormat = svg` all match what config + the key convention
  produce;
- an object actually exists in MinIO at that `bucket`/`storageKey`, with an
  SVG-compatible content type;
- every seeded tool has a row.

It exits non-zero with an aggregated list of every problem found, so no QR
metadata is left pointing at a missing or inconsistent object.

## Required environment variables

These scripts are CLI tooling, so — like `drizzle.config.ts` and the seed — they
read `.env` directly (via `dotenv`), not the app's typed Config module.

| Variable | Used by | Purpose |
|---|---|---|
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` | place, verify | MinIO connection. |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | place, verify | MinIO credentials. |
| `MINIO_BUCKET` | place, verify | Target bucket. |
| `MINIO_PUBLIC_URL` | verify | Base URL the seeded `publicUrl` is composed from. |
| `MINIO_PATH_STYLE` | place, verify | Path-style vs virtual-hosted URL shape (defaults to `true`). |
| `DATABASE_URL` | verify | PostgreSQL connection (verify reads `qr_tools`). |

## Out of scope (still)

This sub-stage adds **only** QR `.svg` placement + verification. It does **not**
implement presentation upload, shop/purchase/inventory behaviour, QR usage
tracking, signed URLs, private buckets, a CDN, REST/WebSocket endpoints, or any
Stage 5B/6 gameplay. Runtime tables are never seeded or written here.

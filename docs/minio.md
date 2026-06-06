# MinIO (local object storage)

MinIO is the S3-compatible object store. **PostgreSQL stores only file metadata;
MinIO stores the bytes.** For the MVP the bucket is public and files are served
via plain public URLs — no signed URLs, no private buckets, no CDN.

## Local access

| What | Value (from `.env.example`) |
|---|---|
| S3 API endpoint | http://localhost:9000 |
| Web console | http://localhost:9001 |
| Root user / access key | `minioadmin` |
| Root password / secret key | `minioadmin` |
| Bucket | `svoya-igra` |

The MinIO container's root credentials are set from `MINIO_ACCESS_KEY` /
`MINIO_SECRET_KEY`, so the same values the backend uses also log you into the
console. These are **local-development defaults** — change them everywhere
before any shared environment.

## The bucket is not created automatically by the app

The storage health probe is **read-only**: it checks that the configured bucket
exists and never creates it. On a fresh stack the bucket is missing, so
`GET /api/health` reports `storage: error` (bucket does not exist) until the
bucket is provisioned.

**Recommended — the QR placement procedure** (Stage 5A.7) creates the bucket,
applies the public-read policy, and uploads the QR `.svg` objects in one step:

```bash
npm run db:seed:qr-assets    # ensures bucket + public policy + uploads QR svgs
npm run db:verify:qr-assets  # confirms metadata ↔ objects consistency
```

See [qr-assets.md](qr-assets.md) for the full procedure. After it runs, storage
health turns green.

If you only need the empty bucket (no QR objects yet), you can also create it
manually:

**Option A — MinIO console:** open http://localhost:9001, log in, and create a
bucket named `svoya-igra`.

**Option B — one-off `mc` container** (run while the stack is up):

```bash
docker run --rm --network svoya-igra-backend_svoya-igra --entrypoint sh \
  minio/mc -c "mc alias set local http://minio:9000 minioadmin minioadmin \
  && mc mb --ignore-existing local/svoya-igra \
  && mc anonymous set download local/svoya-igra"
```

`mc anonymous set download` makes objects publicly readable, matching the
public-bucket model the frontend relies on (the same policy the placement
procedure applies). (The Compose network is named `<project>_svoya-igra`; the
project name defaults to the repo folder `svoya-igra-backend`. Adjust if you
renamed the folder.)

## Storage key & public URL conventions

These are defined in `src/infrastructure/storage/storage-key.helper.ts` and used
by the storage seam. No objects are written yet — the conventions are in place
for later stages:

- **QR tools** are global/static assets, so keys carry no room id:
  `qr-tools/<qrToolId>.svg`. Seeded (metadata, Stage 5A.6) and placed in MinIO by
  the QR procedure (Stage 5A.7, see [qr-assets.md](qr-assets.md)).
- **Presentation uploads** are room/team-scoped runtime files:
  `rooms/<roomId>/presentations/<teamId>/<submissionId>.<ext>`. Implemented in
  the Presentation feature stage.

Public URLs are built from `MINIO_PUBLIC_URL` + bucket + key (path-style by
default, `MINIO_PATH_STYLE=true`). `MINIO_PUBLIC_URL` is always a browser-facing
host URL — it is **not** rewritten to the `minio` service name inside Compose.

> **Port coupling:** `MINIO_PUBLIC_URL` hardcodes the S3 API port (`9000`). It is
> independent of `MINIO_PORT`, so if you change `MINIO_PORT` you must update the
> port in `MINIO_PUBLIC_URL` by hand to keep public links resolvable.

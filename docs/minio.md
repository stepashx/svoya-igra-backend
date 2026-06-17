# MinIO (local object storage)

MinIO is the S3-compatible object store. **PostgreSQL stores only file metadata;
MinIO stores the bytes.** For the MVP the bucket is public and files are served
via plain public URLs — no signed URLs, no private buckets, no CDN (see
[Known limitations](#known-limitations)).

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

## The bucket is provisioned by the seed

`npm run db:seed` provisions MinIO: it creates the `svoya-igra` bucket if it is
absent, applies the anonymous public-read policy, and uploads one placeholder QR
`.svg` per `qr_tool`. The write side lives in
`src/infrastructure/database/seeds/bucket-provisioning.ts` and is idempotent —
re-running the seed never re-creates the bucket or duplicates objects. See
[migrations-and-seeds.md](migrations-and-seeds.md).

The runtime storage health probe is **read-only**: it checks that the configured
bucket exists and never creates it. So on a fresh stack — before the seed has
run — `GET /api/health` reports `storage: error` (bucket does not exist); after
`db:seed`, storage turns green.

If you want to create the bucket **without** running the full seed (e.g. to turn
storage green before catalogs exist), do it manually instead:

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
public-bucket model the frontend relies on. (The Compose network is named
`<project>_svoya-igra`; the project name defaults to the repo folder
`svoya-igra-backend`. Adjust if you renamed the folder.) Note this only creates
an empty bucket — you still need `db:seed` to upload the QR assets and load the
catalogs.

## Storage key & public URL conventions

These are defined in `src/infrastructure/storage/storage-key.helper.ts` and used
across the storage seam:

- **QR tools** are global/static assets, so keys carry no room id:
  `qr-tools/<qrToolId>.svg`. Written by `db:seed` (placeholder SVGs, one per QR
  tool).
- **Presentation uploads** are room/team-scoped runtime files:
  `rooms/<roomId>/presentations/<teamId>/<submissionId>.<ext>`. Written when a
  team captain uploads a presentation during the Presentation stage.

Public URLs are built from `MINIO_PUBLIC_URL` + bucket + key (path-style by
default, `MINIO_PATH_STYLE=true`). `MINIO_PUBLIC_URL` is always a browser-facing
host URL — it is **not** rewritten to the `minio` service name inside Compose.

> **Port coupling:** `MINIO_PUBLIC_URL` hardcodes the S3 API port (`9000`). It is
> independent of `MINIO_PORT`, so if you change `MINIO_PORT` you must update the
> port in `MINIO_PUBLIC_URL` by hand to keep public links resolvable.

## Known limitations

- **The bucket is public-read by design (MVP).** Files (QR assets, uploaded
  presentations) are served via plain anonymous public URLs. Signed URLs,
  private buckets, a CDN, and serving uploads from a separate origin are all
  **post-MVP** — fine for a single demo game, not for an untrusted public
  deployment.
- **Stored-XSS is already mitigated**, so the public bucket is not an open
  hole: uploaded presentations are written with a server-canonical `Content-Type`
  derived from the file extension (never the client-supplied MIME) plus
  `Content-Disposition: attachment`, so a mislabelled HTML payload downloads
  rather than executing when its public URL is opened (see
  `src/infrastructure/storage/storage.service.ts`).

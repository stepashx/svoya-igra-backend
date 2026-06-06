# QR assets (Stage 5A.7)

Infrastructure owns MinIO/QR placement; this folder holds the **QR `.svg`
placement & verification procedure** and the committed QR asset files. No feature
behaviour lives here, and nothing in the application/domain layers imports it.

## Files

| Path | Responsibility |
|---|---|
| `assets/<payload>.svg` | The committed QR `.svg` files (MVP placeholders). |
| `qr-asset-source.ts` | Pure mapping: seeded tool → local file → global storage key. |
| `qr-assets.ts` | `ensurePublicBucket` / `placeQrAssets` / `verifyQrAssets` (MinIO + Drizzle). |
| `qr-assets-env.ts` | CLI env wiring: MinIO client, storage descriptor, Drizzle handle. |
| `place-qr-assets.ts` | `npm run db:seed:qr-assets` entrypoint. |
| `verify-qr-assets.ts` | `npm run db:verify:qr-assets` entrypoint. |
| `qr-asset-source.spec.ts`, `qr-assets.spec.ts` | DB/MinIO-free checks (run in `npm test`). |

## Run

```bash
npm run db:migrate          # schema
npm run db:seed             # QR metadata (+ the rest of the static catalog)
npm run db:seed:qr-assets   # place QR .svg objects in MinIO (creates the bucket)
npm run db:verify:qr-assets # verify metadata ↔ objects
```

See [../../../../docs/qr-assets.md](../../../../docs/qr-assets.md) for the full
procedure, env vars, asset location, and scope boundaries.

## Scope boundaries

- **Metadata in PostgreSQL, bytes in MinIO.** `qr_tools.storageKey` is global
  (`qr-tools/<qrToolId>.svg`, no `roomId`).
- **Public bucket, public URLs.** No signed URLs, private buckets, or CDN.
- **QR only.** No presentation upload, shop/purchase/inventory, QR usage
  tracking, REST/WS endpoints, or Stage 5B/6 behaviour. Runtime tables are never
  touched.

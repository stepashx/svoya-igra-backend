/**
 * QR asset placement entrypoint (Stage 5A.7) — `npm run db:seed:qr-assets`.
 *
 * Ensures the public bucket exists and uploads the seeded QR `.svg` objects to
 * MinIO under their global storage keys. Run AFTER `db:migrate` and `db:seed`
 * (the seed records the QR metadata this placement backs with objects). Connects
 * to MinIO only — it does not touch the database. Verify with
 * `npm run db:verify:qr-assets` afterwards.
 */
import 'dotenv/config';
import { createMinioClient, formatCliError } from './qr-assets-env';
import { ensurePublicBucket, placeQrAssets } from './qr-assets';

async function main(): Promise<void> {
  const { client, bucket } = createMinioClient();

  const { created } = await ensurePublicBucket(client, bucket);
  // eslint-disable-next-line no-console
  console.log(
    created
      ? `Created public bucket "${bucket}".`
      : `Bucket "${bucket}" already exists (public-read policy reapplied).`,
  );

  const placed = await placeQrAssets(client, bucket);
  // eslint-disable-next-line no-console
  console.log(`Placed ${placed.length} QR .svg objects in MinIO:`);
  for (const object of placed) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${object.storageKey} (${object.bytes} bytes) — ${object.title}`,
    );
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('QR asset placement failed:', formatCliError(error));
  process.exitCode = 1;
});

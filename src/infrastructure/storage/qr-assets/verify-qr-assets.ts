/**
 * QR asset verification entrypoint (Stage 5A.7) — `npm run db:verify:qr-assets`.
 *
 * Confirms the seeded `qr_tools` metadata is internally consistent with config
 * and that every row is backed by a real, SVG-typed object in MinIO. Reads both
 * the database and MinIO. Exits non-zero with a detailed report if anything is
 * missing or inconsistent. Run AFTER migrate → seed → place QR assets.
 */
import 'dotenv/config';
import {
  createDb,
  createMinioClient,
  formatCliError,
  readQrStorageDescriptor,
} from './qr-assets-env';
import { verifyQrAssets } from './qr-assets';

async function main(): Promise<void> {
  const { client, bucket } = createMinioClient();
  const storage = readQrStorageDescriptor();
  const { pool, db } = createDb();

  try {
    const result = await verifyQrAssets({ client, db, storage });
    // eslint-disable-next-line no-console
    console.log(
      `QR asset verification passed: ${result.checked} qr_tools rows are consistent ` +
        `with config and backed by MinIO objects in bucket "${bucket}".`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('QR asset verification failed:', formatCliError(error));
  process.exitCode = 1;
});

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'minio';
import { Pool } from 'pg';
import {
  buildPublicUrl,
  qrToolStorageKey,
} from '../../storage/storage-key.helper';
import * as schema from '../schema';
import { provisionBucket, uploadQrToolSvg } from './bucket-provisioning';
import { QrStorageByToolId, seedCatalogs } from './catalog-seeder';
import { buildPlaceholderQrSvg } from './placeholder-qr';
import { loadSeedData } from './seed-data.loader';

/**
 * Seed CLI for Stage 4.2: read the placeholder catalog JSON, provision the
 * MinIO bucket, upload one placeholder QR SVG per `qr_tool`, then upsert all
 * seven catalogs into PostgreSQL. Idempotent end to end — safe to run twice.
 *
 * Like `drizzle.config.ts`, this is a standalone CLI that runs before Nest's DI
 * exists, so it is a sanctioned reader of `process.env` directly (the app
 * itself reads config only through `AppConfigService`). Env names match
 * `.env.example` / `env.validation.ts`. Run via `npm run db:seed` after
 * `db:migrate`.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function boolEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  return value === 'true';
}

function intEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return parsed;
}

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[seed] ${message}`);
}

async function main(): Promise<void> {
  const data = loadSeedData();
  log('catalog JSON validated');

  const bucket = requireEnv('MINIO_BUCKET');
  const publicBaseUrl = requireEnv('MINIO_PUBLIC_URL');
  const pathStyle = boolEnv('MINIO_PATH_STYLE', true);

  const minio = new Client({
    endPoint: requireEnv('MINIO_ENDPOINT'),
    port: intEnv('MINIO_PORT', 9000),
    useSSL: boolEnv('MINIO_USE_SSL', false),
    accessKey: requireEnv('MINIO_ACCESS_KEY'),
    secretKey: requireEnv('MINIO_SECRET_KEY'),
    pathStyle,
  });

  const { created } = await provisionBucket(minio, bucket);
  log(
    `bucket "${bucket}" ${created ? 'created' : 'already present'}; public-read policy applied`,
  );

  // Upload placeholder QR SVGs first, so DB rows only reference objects that
  // exist. storageKey/publicUrl are deterministic from the fixed UUID.
  const qrStorage: QrStorageByToolId = new Map();
  for (const [index, tool] of data.qrTools.entries()) {
    const storageKey = qrToolStorageKey(tool.id);
    const publicUrl = buildPublicUrl({
      publicBaseUrl,
      bucket,
      storageKey,
      pathStyle,
    });
    await uploadQrToolSvg(minio, {
      bucket,
      storageKey,
      svg: buildPlaceholderQrSvg(`QR ${index + 1}`),
    });
    qrStorage.set(tool.id, { bucket, storageKey, publicUrl });
  }
  log(`uploaded ${data.qrTools.length} placeholder QR SVG(s) to "${bucket}"`);

  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
  try {
    await seedCatalogs(drizzle(pool, { schema }), data, qrStorage);
  } finally {
    await pool.end();
  }

  log('catalogs upserted:');
  log(`  categories:                ${data.categories.length}`);
  log(`  questions:                 ${data.questions.length}`);
  log(`  presentation_topics:       ${data.presentationTopics.length}`);
  log(`  qr_tools:                  ${data.qrTools.length}`);
  log(`  shop_items:                ${data.shopItems.length}`);
  log(`  presentation_requirements: ${data.presentationRequirements.length}`);
  log(`  evaluation_criteria:       ${data.evaluationCriteria.length}`);
  log('done');
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', error);
  process.exit(1);
});

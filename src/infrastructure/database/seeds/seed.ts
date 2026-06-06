/**
 * Seed entrypoint (Stage 5A.6) — `npm run db:seed`.
 *
 * A standalone CLI that applies the required static seeds to the database the
 * same way `drizzle.config.ts` applies migrations. Like that file, this is
 * build/CLI tooling (not application runtime), so it is allowed to read
 * `process.env` directly and load `.env` via `dotenv` — the typed Config module
 * governs the running NestJS app, not this script.
 *
 * Workflow: this runs AFTER migrations. The required order is always
 * `migrate → seed` (see docs/migrations-and-seeds.md). It does NOT create the
 * schema, NOT seed runtime tables, and NOT upload any MinIO objects.
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../schema';
import {
  EXPECTED_SEED_COUNTS,
  SeedCounts,
  SeedStorageConfig,
  seedRequiredStatics,
} from './required-seeds';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env (or export it) before running the seed.`,
    );
  }
  return value;
}

/** Read the MinIO settings used to compose QR-tool metadata (no upload here). */
function readStorageConfig(): SeedStorageConfig {
  return {
    storageProvider: 'minio',
    bucket: requireEnv('MINIO_BUCKET'),
    publicBaseUrl: requireEnv('MINIO_PUBLIC_URL'),
    pathStyle: (process.env.MINIO_PATH_STYLE ?? 'true') === 'true',
  };
}

function reportCounts(counts: SeedCounts): void {
  // eslint-disable-next-line no-console
  console.log('Required static seeds applied. Verified counts:');
  for (const key of Object.keys(EXPECTED_SEED_COUNTS) as (keyof SeedCounts)[]) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${key}: ${counts[key]} (expected ${EXPECTED_SEED_COUNTS[key]})`,
    );
  }
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv('DATABASE_URL');
  const storage = readStorageConfig();

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool, { schema });
    const counts = await seedRequiredStatics(db, storage);
    reportCounts(counts);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    'Seeding failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});

import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Runs once before the e2e suite. Fails fast with a clear message if the
 * database is unreachable, so a missing `docker compose up postgres` does not
 * surface as a confusing per-test timeout. Migrations and seeds are applied by
 * the caller (npm run db:migrate / db:seed) before this runs.
 */
export default async function globalSetup(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — cannot run e2e tests.');
  }
  const pool = new Pool({ connectionString });
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    throw new Error(
      `Cannot reach the e2e database at ${connectionString}. Start it with ` +
        `\`docker compose up -d postgres\` and run db:migrate + db:seed. ` +
        `Cause: ${(error as Error).message}`,
    );
  } finally {
    await pool.end();
  }
}

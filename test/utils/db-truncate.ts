import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Truncates all lobby data between tests while preserving the seeded catalogs.
 * `TRUNCATE rooms CASCADE` clears rooms and everything that references them
 * (players, teams, …); the global seed tables (presentation_topics, categories,
 * …) do not reference rooms and survive.
 */
let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function truncateLobby(): Promise<void> {
  await getPool().query('TRUNCATE TABLE rooms CASCADE');
}

export async function closeTruncatePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

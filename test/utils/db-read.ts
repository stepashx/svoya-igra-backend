import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Minimal read-only DB access for e2e state assertions (e.g. confirming a
 * player's `connection_status` flipped after their last socket dropped). Kept
 * separate from {@link truncateLobby}'s pool so its lifecycle is independent.
 */
let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

/** A player's persisted `connection_status`, or `null` if the row is gone. */
export async function readPlayerConnectionStatus(
  playerId: string,
): Promise<string | null> {
  const result = await getPool().query<{ connection_status: string }>(
    'SELECT connection_status FROM players WHERE id = $1',
    [playerId],
  );
  return result.rows[0]?.connection_status ?? null;
}

export async function closeDbReadPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

import 'dotenv/config';
import { Pool } from 'pg';

/**
 * Minimal raw-SQL write access for e2e state PRESETS (the db-truncate /
 * db-read precedent). Used by the shop-flow suite to park a room near a shop
 * threshold without grinding through dozens of live battle cycles: both
 * counters are plain integer columns with no CHECK constraint, so a raw
 * UPDATE is safe. Note the domain guard `incrementBlockedQuestions` throws at
 * blocked === total — preset 29 and play ONE live cycle to reach the
 * exhausted board, never preset 30 directly.
 */
let pool: Pool | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

/** Overwrite the room's blocked-question and shop-round counters. */
export async function presetRoomCounters(
  roomId: string,
  counters: { blocked: number; shopRound: number },
): Promise<void> {
  await getPool().query(
    'UPDATE rooms SET blocked_questions_count = $2, current_shop_round = $3 WHERE id = $1',
    [roomId, counters.blocked, counters.shopRound],
  );
}

export async function closeDbWritePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

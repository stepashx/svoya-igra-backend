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

/**
 * Overwrite a team's scores (§14.7). Used by the 8.3 purchase suite to give a
 * team a known balance AFTER it has entered the shop (the live entry cycle
 * already awarded points, so presetting before would be overwritten). Both
 * columns are plain integers with no CHECK constraint, so a raw UPDATE is safe.
 */
export async function presetTeamScores(
  teamId: string,
  scores: { earnedScore: number; balance: number },
): Promise<void> {
  await getPool().query(
    'UPDATE teams SET earned_score = $2, balance = $3 WHERE id = $1',
    [teamId, scores.earnedScore, scores.balance],
  );
}

/**
 * Overwrite the room's current stage. Used by the 9.2 presentation suite to
 * park a started room directly in PRESENTATION_PREPARATION without grinding the
 * board to exhaustion (the 8.2 final-shop path already proves that route).
 * `current_stage` is a plain text column (enum-constrained in the domain, not a
 * PG enum type), so a raw parameterised UPDATE is safe.
 */
export async function setRoomStage(
  roomId: string,
  stage: string,
): Promise<void> {
  await getPool().query('UPDATE rooms SET current_stage = $2 WHERE id = $1', [
    roomId,
    stage,
  ]);
}

export async function closeDbWritePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

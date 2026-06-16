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

/**
 * Insert a minimal LATE presentation submission for a team (§9). Used by the
 * 10.3 results suite to give a team a known `late_penalty` snapshot without
 * driving the multipart upload path (covered by the 9.3 suite); the required
 * file-location columns get throwaway values. `late_penalty` carries no DB
 * default, so it is always supplied.
 */
export async function presetLateSubmission(
  roomId: string,
  teamId: string,
  latePenalty: number,
): Promise<void> {
  await getPool().query(
    `INSERT INTO presentation_submissions
       (room_id, team_id, original_file_name, mime_type, file_size, bucket,
        storage_key, public_url, deadline_at, is_late, late_penalty, status)
     VALUES ($1, $2, 'late.pdf', 'application/pdf', 1024, 'presentations',
        $3, $4, now(), true, $5, 'LATE')`,
    [
      roomId,
      teamId,
      `rooms/${roomId}/presentations/${teamId}/late.pdf`,
      `https://cdn.example/${teamId}/late.pdf`,
      latePenalty,
    ],
  );
}

/**
 * Insert a "phantom" team that NEVER presented (turn_order null, no captain) —
 * the §10.3 ⚠️A B1 case. CalculateResults must skip it (no final_results row).
 * Returns the new team id. Only the NOT-NULL columns without a default are set.
 */
export async function insertPhantomTeam(
  roomId: string,
  name: string,
): Promise<string> {
  const result = await getPool().query<{ id: string }>(
    'INSERT INTO teams (room_id, name) VALUES ($1, $2) RETURNING id',
    [roomId, name],
  );
  return result.rows[0].id;
}

export async function closeDbWritePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

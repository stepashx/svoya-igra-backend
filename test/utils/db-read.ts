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

/** A team's persisted scores (§14.7), or `null` if the row is gone. */
export async function readTeamScores(
  teamId: string,
): Promise<{ earned_score: number; balance: number } | null> {
  const result = await getPool().query<{
    earned_score: number;
    balance: number;
  }>('SELECT earned_score, balance FROM teams WHERE id = $1', [teamId]);
  return result.rows[0] ?? null;
}

/** A persisted board cell, narrowed to the fields the board-init e2e asserts. */
export interface BoardCellRow {
  room_id: string;
  category_id: string;
  points: number;
  position: number;
  state: string;
}

/** Every board cell seeded for a room (used to assert board-init). */
export async function readBoardCells(roomId: string): Promise<BoardCellRow[]> {
  const result = await getPool().query<BoardCellRow>(
    'SELECT room_id, category_id, points, position, state FROM board_cells WHERE room_id = $1',
    [roomId],
  );
  return result.rows;
}

/** A persisted purchase record (§14.8), narrowed to the fields the 8.3 e2e asserts. */
export interface PurchaseRow {
  id: string;
  team_id: string;
  shop_item_id: string;
  price: number;
}

/** Every purchase recorded for a room (used to assert the §14.8 buy/race). */
export async function readPurchases(roomId: string): Promise<PurchaseRow[]> {
  const result = await getPool().query<PurchaseRow>(
    'SELECT id, team_id, shop_item_id, price FROM purchases WHERE room_id = $1',
    [roomId],
  );
  return result.rows;
}

/** A persisted inventory entry, narrowed to the fields the 8.3 e2e asserts. */
export interface InventoryItemRow {
  id: string;
  team_id: string;
  shop_item_id: string;
  qr_tool_id: string;
}

/** Every inventory entry recorded for a room (used to assert the team gain). */
export async function readInventoryItems(
  roomId: string,
): Promise<InventoryItemRow[]> {
  const result = await getPool().query<InventoryItemRow>(
    'SELECT id, team_id, shop_item_id, qr_tool_id FROM inventory_items WHERE room_id = $1',
    [roomId],
  );
  return result.rows;
}

/** A persisted presentation submission, narrowed to the fields the 9.3 e2e asserts. */
export interface SubmissionRow {
  id: string;
  team_id: string;
  uploaded_by_player_id: string | null;
  original_file_name: string;
  mime_type: string;
  file_size: number;
  storage_key: string;
  public_url: string;
  is_late: boolean;
  late_penalty: number;
  status: string;
}

/** Every presentation submission recorded for a room (used to assert the upload). */
export async function readSubmissions(
  roomId: string,
): Promise<SubmissionRow[]> {
  const result = await getPool().query<SubmissionRow>(
    `SELECT id, team_id, uploaded_by_player_id, original_file_name, mime_type,
            file_size, storage_key, public_url, is_late, late_penalty, status
     FROM presentation_submissions WHERE room_id = $1`,
    [roomId],
  );
  return result.rows;
}

/** A team's denormalised presentation-submission link, or `null` if unset/gone. */
export async function readTeamSubmissionId(
  teamId: string,
): Promise<string | null> {
  const result = await getPool().query<{
    presentation_submission_id: string | null;
  }>('SELECT presentation_submission_id FROM teams WHERE id = $1', [teamId]);
  return result.rows[0]?.presentation_submission_id ?? null;
}

/** A persisted evaluation score (§12), narrowed to the fields the 10.2 e2e asserts. */
export interface EvaluationScoreRow {
  id: string;
  target_team_id: string;
  evaluator_type: string;
  evaluator_team_id: string | null;
  host_id: string | null;
  topic_score: number;
  design_score: number;
  total_score: number;
  weight: number;
  confirmed_at: Date | null;
}

/** Every evaluation score recorded for a room (used to assert collection/confirm). */
export async function readEvaluationScores(
  roomId: string,
): Promise<EvaluationScoreRow[]> {
  const result = await getPool().query<EvaluationScoreRow>(
    `SELECT id, target_team_id, evaluator_type, evaluator_team_id, host_id,
            topic_score, design_score, total_score, weight, confirmed_at
     FROM evaluation_scores WHERE room_id = $1`,
    [roomId],
  );
  return result.rows;
}

/** A room's lifecycle fields (§14.10) — used to assert the 10.3 game finish. */
export async function readRoomLifecycle(roomId: string): Promise<{
  current_stage: string;
  status: string;
  finished_at: Date | null;
} | null> {
  const result = await getPool().query<{
    current_stage: string;
    status: string;
    finished_at: Date | null;
  }>('SELECT current_stage, status, finished_at FROM rooms WHERE id = $1', [
    roomId,
  ]);
  return result.rows[0] ?? null;
}

/** A persisted final result (§14.10), narrowed to the fields the 10.3 e2e asserts. */
export interface FinalResultRow {
  id: string;
  team_id: string;
  earned_score: number;
  presentation_score_raw: number;
  late_penalty: number;
  presentation_score_final: number;
  final_score: number;
  place: number;
}

/** Every final result for a room, ordered (place, teamId) — the leaderboard. */
export async function readFinalResults(
  roomId: string,
): Promise<FinalResultRow[]> {
  const result = await getPool().query<FinalResultRow>(
    `SELECT id, team_id, earned_score, presentation_score_raw, late_penalty,
            presentation_score_final, final_score, place
     FROM final_results WHERE room_id = $1
     ORDER BY place ASC, team_id ASC`,
    [roomId],
  );
  return result.rows;
}

export async function closeDbReadPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

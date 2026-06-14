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

export async function closeDbReadPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

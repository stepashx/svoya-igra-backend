import { boardCells } from '../../../../infrastructure/database/schema';
import { BoardCell } from '../../../domain/entities';

type BoardCellRow = typeof boardCells.$inferSelect;
type BoardCellInsert = typeof boardCells.$inferInsert;

/**
 * Row ↔ entity for the per-room board cells. The Drizzle `$infer*` types are
 * confined to this file — they never leak past the mapper.
 *
 * `state` passes straight through in both directions. The schema column union
 * ({@link boardCells}.state) and the domain {@link BoardCellState} union are
 * declared independently but with identical literals; these assignments only
 * type-check while the two stay in lock-step, so any drift breaks the build —
 * that is the compile-time conformance guard (no runtime mapping table).
 */
export function mapRowToBoardCell(row: BoardCellRow): BoardCell {
  return BoardCell.reconstitute({
    id: row.id,
    roomId: row.roomId,
    questionId: row.questionId,
    categoryId: row.categoryId,
    points: row.points,
    position: row.position,
    state: row.state,
    openedByTeamId: row.openedByTeamId,
    answeredByTeamId: row.answeredByTeamId,
    blockedAt: row.blockedAt,
  });
}

/** Entity → full insert payload (used by the board-init bulk create). */
export function mapBoardCellToInsert(cell: BoardCell): BoardCellInsert {
  return {
    id: cell.id,
    roomId: cell.roomId,
    questionId: cell.questionId,
    categoryId: cell.categoryId,
    points: cell.points,
    position: cell.position,
    state: cell.state,
    openedByTeamId: cell.openedByTeamId,
    answeredByTeamId: cell.answeredByTeamId,
    blockedAt: cell.blockedAt,
  };
}

/**
 * Entity → partial update payload (mutable columns only). The identity columns
 * (room/question/category/points/position) are fixed once seeded; only the
 * lifecycle state and its actor/timestamp links change.
 */
export function mapBoardCellToUpdate(
  cell: BoardCell,
): Partial<BoardCellInsert> {
  return {
    state: cell.state,
    openedByTeamId: cell.openedByTeamId,
    answeredByTeamId: cell.answeredByTeamId,
    blockedAt: cell.blockedAt,
  };
}

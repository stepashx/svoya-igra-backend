import { BoardCell } from '../entities';

/**
 * Persistence port for per-room board cells (plan §12, §15.5). Unlike the
 * catalogs, cells are runtime state: board-init bulk-creates them and the combat
 * use cases (6.2) update them. Signatures speak only in domain types; the
 * Drizzle adapter lives in infrastructure/persistence.
 */
export interface BoardCellRepositoryPort {
  createMany(cells: BoardCell[]): Promise<void>;
  existsByRoomId(roomId: string): Promise<boolean>;
  findById(id: string): Promise<BoardCell | null>;
  findByRoomCategoryAndPosition(
    roomId: string,
    categoryId: string,
    position: number,
  ): Promise<BoardCell | null>;
  /**
   * The room's single active cell — one whose state is SELECTED or OPENED — or
   * null when none is active. Underpins the "one active cell per room"
   * invariant the combat use cases enforce under the per-room lock (6.2).
   */
  findActiveByRoomId(roomId: string): Promise<BoardCell | null>;
  listByRoomId(roomId: string): Promise<BoardCell[]>;
  update(cell: BoardCell): Promise<void>;
}

export const BOARD_CELL_REPOSITORY_PORT = Symbol('BoardCellRepositoryPort');

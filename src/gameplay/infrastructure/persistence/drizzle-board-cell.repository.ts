import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { boardCells } from '../../../infrastructure/database/schema';
import { BoardCell } from '../../domain/entities';
import { BoardCellRepositoryPort } from '../../domain/ports';
import {
  mapBoardCellToInsert,
  mapBoardCellToUpdate,
  mapRowToBoardCell,
} from './mappers';

/**
 * Drizzle/PostgreSQL adapter for {@link BoardCellRepositoryPort}. `board_cells`
 * carries no unique index, so writes need no 23505 translation.
 */
@Injectable()
export class DrizzleBoardCellRepository implements BoardCellRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  /** Bulk-insert the freshly-seeded board (board-init). A no-op for an empty board. */
  async createMany(cells: BoardCell[]): Promise<void> {
    if (cells.length === 0) {
      return;
    }
    await this.executor()
      .insert(boardCells)
      .values(cells.map(mapBoardCellToInsert));
  }

  /** Cheap existence probe (one column, one row) — board-init idempotency gate. */
  async existsByRoomId(roomId: string): Promise<boolean> {
    const [row] = await this.executor()
      .select({ id: boardCells.id })
      .from(boardCells)
      .where(eq(boardCells.roomId, roomId))
      .limit(1);
    return row !== undefined;
  }

  async findById(id: string): Promise<BoardCell | null> {
    const [row] = await this.executor()
      .select()
      .from(boardCells)
      .where(eq(boardCells.id, id))
      .limit(1);
    return row ? mapRowToBoardCell(row) : null;
  }

  async findByRoomCategoryAndPosition(
    roomId: string,
    categoryId: string,
    position: number,
  ): Promise<BoardCell | null> {
    const [row] = await this.executor()
      .select()
      .from(boardCells)
      .where(
        and(
          eq(boardCells.roomId, roomId),
          eq(boardCells.categoryId, categoryId),
          eq(boardCells.position, position),
        ),
      )
      .limit(1);
    return row ? mapRowToBoardCell(row) : null;
  }

  async listByRoomId(roomId: string): Promise<BoardCell[]> {
    const rows = await this.executor()
      .select()
      .from(boardCells)
      .where(eq(boardCells.roomId, roomId));
    return rows.map(mapRowToBoardCell);
  }

  async update(cell: BoardCell): Promise<void> {
    await this.executor()
      .update(boardCells)
      .set(mapBoardCellToUpdate(cell))
      .where(eq(boardCells.id, cell.id));
  }
}

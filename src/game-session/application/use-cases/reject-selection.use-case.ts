import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { BoardCell } from '../../../gameplay/domain/entities';
import {
  NoActiveCellError,
  UnexpectedGameStageError,
} from '../../../gameplay/domain/errors';
import {
  BOARD_CELL_REPOSITORY_PORT,
  BoardCellRepositoryPort,
} from '../../../gameplay/domain/ports';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { GameplayEvent, boardCellSummary } from '../events';

export interface RejectSelectionInput {
  roomId: string;
  cellId: string;
}

/**
 * The host rejects the captain's pick (plan §14.4, §15.6). Legal only in
 * GAME_BOARD with the room's active cell SELECTED and matching the requested id.
 * The cell goes SELECTED → AVAILABLE; the room stays in GAME_BOARD so the
 * captain can pick again. Broadcasts (room-wide) `cell-selection-rejected` and a
 * `board-state-updated` snapshot.
 */
@Injectable()
export class RejectSelectionUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(BOARD_CELL_REPOSITORY_PORT)
    private readonly cells: BoardCellRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
  ) {}

  async execute(input: RejectSelectionInput): Promise<BoardCell> {
    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      if (room.currentStage !== 'GAME_BOARD') {
        throw new UnexpectedGameStageError();
      }

      const active = await this.cells.findActiveByRoomId(room.id);
      if (
        !active ||
        active.id !== input.cellId ||
        active.state !== 'SELECTED'
      ) {
        throw new NoActiveCellError();
      }

      active.deselect(); // SELECTED → AVAILABLE
      await this.cells.update(active);

      this.realtime.emitToRoom(room.id, GameplayEvent.CellSelectionRejected, {
        roomId: room.id,
        cell: boardCellSummary(active),
      });
      const cells = await this.cells.listByRoomId(room.id);
      this.realtime.emitToRoom(room.id, GameplayEvent.BoardStateUpdated, {
        roomId: room.id,
        cells: cells.map(boardCellSummary),
      });

      return active;
    });
  }
}

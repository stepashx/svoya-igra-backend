import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { BoardCell } from '../../../gameplay/domain/entities';
import {
  BoardCellNotFoundError,
  CellSelectionInProgressError,
  NotActiveTeamCaptainError,
  UnexpectedGameStageError,
} from '../../../gameplay/domain/errors';
import {
  BOARD_CELL_REPOSITORY_PORT,
  BoardCellRepositoryPort,
} from '../../../gameplay/domain/ports';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { GameplayEvent, boardCellSummary } from '../events';

export interface SelectQuestionInput {
  roomId: string;
  actingPlayerId: string;
  cellId: string;
}

/**
 * The active team's captain picks a cell (plan §14.4, §15.5; first step of the
 * two-step open). Legal only in GAME_BOARD and only for the captain of the
 * room's current team. Enforces the "one active cell per room" invariant under
 * the per-room lock (the table has no unique index — §19): if any cell is
 * already SELECTED/OPENED the pick is rejected. The chosen cell goes
 * AVAILABLE → SELECTED and a `cell-selection-requested` broadcast prompts the
 * host (room-wide in 6.2a; host-only narrowing is 6.2b).
 */
@Injectable()
export class SelectQuestionUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(BOARD_CELL_REPOSITORY_PORT)
    private readonly cells: BoardCellRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
  ) {}

  async execute(input: SelectQuestionInput): Promise<BoardCell> {
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

      const activeTeam = room.currentTeamId
        ? await this.teams.findById(room.currentTeamId)
        : null;
      if (!activeTeam || activeTeam.captainPlayerId !== input.actingPlayerId) {
        throw new NotActiveTeamCaptainError();
      }

      // One active cell per room: reject a pick while another is in progress.
      if (await this.cells.findActiveByRoomId(room.id)) {
        throw new CellSelectionInProgressError();
      }

      const cell = await this.cells.findById(input.cellId);
      if (!cell || cell.roomId !== room.id) {
        throw new BoardCellNotFoundError();
      }

      cell.select(); // AVAILABLE → SELECTED (CellNotAvailableError otherwise)
      await this.cells.update(cell);

      this.realtime.emitToRoom(room.id, GameplayEvent.CellSelectionRequested, {
        roomId: room.id,
        cell: boardCellSummary(cell),
      });

      return cell;
    });
  }
}

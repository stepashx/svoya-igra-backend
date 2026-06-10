import { Inject, Injectable } from '@nestjs/common';
import { DomainRuleError } from '../../../core/errors/app.error';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import {
  BOARD_CELL_REPOSITORY_PORT,
  BoardCellRepositoryPort,
} from '../../../gameplay/domain/ports';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { GameStage } from '../../domain/types';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { AnswerTimerRegistry } from '../timers';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { GameplayEvent } from '../events';

export interface AdvanceOnTimeoutInput {
  roomId: string;
}

export interface AdvanceOnTimeoutResult {
  stage: GameStage;
}

/**
 * Host-driven timeout bridge for the answer phase (plan §15.7 advance). There is
 * no server scheduler: when the lazy answer timer has EXPIRED while the room is
 * still QUESTION_OPENED, the host advances the room QUESTION_OPENED →
 * ANSWER_REVIEW and a `question-timer-ended` broadcast fires. Any other state
 * (wrong stage, or timer not yet expired) is a 409 — this is strictly the
 * timeout bridge, not a general manual "advance".
 *
 * The timer entry is left in place; {@link ReviewAnswerUseCase} clears it.
 */
@Injectable()
export class AdvanceOnTimeoutUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(BOARD_CELL_REPOSITORY_PORT)
    private readonly cells: BoardCellRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    private readonly timer: AnswerTimerRegistry,
  ) {}

  async execute(input: AdvanceOnTimeoutInput): Promise<AdvanceOnTimeoutResult> {
    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      if (room.currentStage !== 'QUESTION_OPENED') {
        throw new UnexpectedGameStageError();
      }
      if (this.timer.read(room.id, this.clock.now()).status !== 'EXPIRED') {
        throw new DomainRuleError(
          'The answer timer has not expired yet; cannot advance.',
        );
      }

      const active = await this.cells.findActiveByRoomId(room.id);
      room.transitionTo('ANSWER_REVIEW');
      await this.rooms.update(room);

      this.realtime.emitToRoom(room.id, GameplayEvent.QuestionTimerEnded, {
        roomId: room.id,
        cellId: active?.id ?? null,
      });

      return { stage: room.currentStage };
    });
  }
}

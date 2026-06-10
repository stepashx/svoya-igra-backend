import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { BoardCell, Question } from '../../../gameplay/domain/entities';
import {
  NoActiveCellError,
  QuestionNotFoundError,
  UnexpectedGameStageError,
} from '../../../gameplay/domain/errors';
import {
  BOARD_CELL_REPOSITORY_PORT,
  BoardCellRepositoryPort,
  QUESTION_REPOSITORY_PORT,
  QuestionRepositoryPort,
} from '../../../gameplay/domain/ports';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { AnswerTimerRegistry, AnswerTimerState } from '../timers';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import {
  GameplayEvent,
  boardCellSummary,
  roomQuestionSummary,
} from '../events';

export interface OpenQuestionInput {
  roomId: string;
  cellId: string;
}

/** The opened cell, its question (host view), and the freshly started timer. */
export interface OpenQuestionResult {
  cell: BoardCell;
  question: Question;
  timer: AnswerTimerState;
}

/**
 * The host approves the captain's pick and reveals the question (plan §14.4,
 * §15.6; second step of the two-step open). Legal only in GAME_BOARD with the
 * room's active cell SELECTED and matching the requested id. The cell goes
 * SELECTED → OPENED (recording the active team as opener), the room advances
 * GAME_BOARD → QUESTION_OPENED, and the answer timer starts (endsAt = now +
 * ANSWER_TIMER_SECONDS).
 *
 * Broadcasts (room-wide): `cell-selection-approved`, `question-opened` (WITHOUT
 * `correctAnswer` — §16.4 secrecy) and `question-timer-started` (carrying
 * startedAt/endsAt). The result returns the host view (question with answer) for
 * the REST response; the answer never enters the broadcast.
 */
@Injectable()
export class OpenQuestionUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(BOARD_CELL_REPOSITORY_PORT)
    private readonly cells: BoardCellRepositoryPort,
    @Inject(QUESTION_REPOSITORY_PORT)
    private readonly questions: QuestionRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    private readonly timer: AnswerTimerRegistry,
  ) {}

  async execute(input: OpenQuestionInput): Promise<OpenQuestionResult> {
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

      const question = await this.questions.findById(active.questionId);
      if (!question) {
        throw new QuestionNotFoundError();
      }

      // The opener is the active team (guaranteed in GAME_BOARD).
      const openerTeamId = room.currentTeamId;
      if (!openerTeamId) {
        throw new NoActiveCellError();
      }

      active.open(openerTeamId); // SELECTED → OPENED
      room.transitionTo('QUESTION_OPENED');

      await this.cells.update(active);
      await this.rooms.update(room);

      const timer = this.timer.start(
        room.id,
        active.id,
        question.id,
        this.clock.now(),
      );

      this.realtime.emitToRoom(room.id, GameplayEvent.CellSelectionApproved, {
        roomId: room.id,
        cell: boardCellSummary(active),
      });
      this.realtime.emitToRoom(room.id, GameplayEvent.QuestionOpened, {
        roomId: room.id,
        cellId: active.id,
        question: roomQuestionSummary(question),
      });
      this.realtime.emitToRoom(room.id, GameplayEvent.QuestionTimerStarted, {
        roomId: room.id,
        cellId: active.id,
        startedAt: timer.startedAt,
        endsAt: timer.endsAt,
      });

      return { cell: active, question, timer };
    });
  }
}

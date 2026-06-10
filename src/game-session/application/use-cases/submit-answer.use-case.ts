import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { BoardCell, Question } from '../../../gameplay/domain/entities';
import {
  AnswerTimeExpiredError,
  NoActiveCellError,
  NotActiveTeamCaptainError,
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
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { GameStage } from '../../domain/types';
import { AnswerTimerRegistry } from '../timers';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { GameplayEvent } from '../events';

export interface SubmitAnswerInput {
  roomId: string;
  actingPlayerId: string;
  /** Optional answer text — not persisted (no column); only echoed in the event. */
  answer?: string;
}

/** The active cell, its question (room view), and the new stage. */
export interface SubmitAnswerResult {
  cell: BoardCell;
  question: Question;
  stage: GameStage;
}

/**
 * The active team's captain submits an answer (plan §14.4, §15.6). Legal only in
 * QUESTION_OPENED and only for the captain of the room's current team. A lazy
 * ClockPort check rejects a late submission ({@link AnswerTimeExpiredError},
 * 409) without advancing the stage — the host bridges a real timeout via the
 * advance endpoint. On time, the room advances QUESTION_OPENED → ANSWER_REVIEW
 * and an `answer-submitted` broadcast carries the cell/team (and the optional
 * answer text, which is never persisted).
 */
@Injectable()
export class SubmitAnswerUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
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

  async execute(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
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

      const activeTeam = room.currentTeamId
        ? await this.teams.findById(room.currentTeamId)
        : null;
      if (!activeTeam || activeTeam.captainPlayerId !== input.actingPlayerId) {
        throw new NotActiveTeamCaptainError();
      }

      // Lazy expiry check — a late answer is rejected, the stage is unchanged.
      if (this.timer.read(room.id, this.clock.now()).status === 'EXPIRED') {
        throw new AnswerTimeExpiredError();
      }

      const active = await this.cells.findActiveByRoomId(room.id);
      if (!active || active.state !== 'OPENED') {
        throw new NoActiveCellError();
      }
      const question = await this.questions.findById(active.questionId);
      if (!question) {
        throw new QuestionNotFoundError();
      }

      room.transitionTo('ANSWER_REVIEW');
      await this.rooms.update(room);

      this.realtime.emitToRoom(room.id, GameplayEvent.AnswerSubmitted, {
        roomId: room.id,
        cellId: active.id,
        teamId: activeTeam.id,
        answer: input.answer ?? null,
      });

      return { cell: active, question, stage: room.currentStage };
    });
  }
}

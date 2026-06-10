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
import { Room, Team } from '../../domain/entities';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { AnswerTimerRegistry } from '../timers';
import {
  HOST_REALTIME_EVENTS_PORT,
  HostRealtimeEventsPort,
  TRANSACTION_PORT,
  TransactionPort,
} from '../ports';
import { GameSessionEvent, GameplayEvent, boardCellSummary } from '../events';

export interface ReviewAnswerInput {
  roomId: string;
  accepted: boolean;
  /**
   * Whether to reveal the correct answer to the host (plan §14.6 optional).
   * When `true` the loaded answer is additionally emitted host-only as
   * `question-correct-answer-shown-to-host` (6.2b); REST (`current/host`,
   * `current/answer`) stays the source of truth.
   */
  revealAnswer?: boolean;
}

/** The reviewed room, the blocked cell, and who plays next. */
export interface ReviewAnswerResult {
  room: Room;
  cell: BoardCell;
  nextTeamId: string | null;
}

/**
 * The host reviews the submitted answer (plan §14.4, §15.6). Legal only in
 * ANSWER_REVIEW with the room's active cell OPENED. The cell is BLOCKED on EITHER
 * outcome (§14.4) — the answerer is the opening team when accepted, else null —
 * the blocked-question count increments, the room returns to GAME_BOARD, the
 * turn moves to the next team (round-robin by turn order), and the answer timer
 * is cleared.
 *
 * Stage 6 records the review outcome only — it does NOT change any score
 * (`score-changed` is Stage 7). Broadcasts (room-wide): `answer-accepted` /
 * `answer-rejected`, `cell-blocked`, `game-turn-changed` (the shared
 * game-session name) and `board-state-updated`. With `revealAnswer` the correct
 * answer additionally goes to the host's sockets only
 * (`question-correct-answer-shown-to-host` via {@link HostRealtimeEventsPort},
 * 6.2b) — it never enters a room-wide payload (§16.4 secrecy).
 */
@Injectable()
export class ReviewAnswerUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(BOARD_CELL_REPOSITORY_PORT)
    private readonly cells: BoardCellRepositoryPort,
    @Inject(QUESTION_REPOSITORY_PORT)
    private readonly questions: QuestionRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(HOST_REALTIME_EVENTS_PORT)
    private readonly hostRealtime: HostRealtimeEventsPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    private readonly timer: AnswerTimerRegistry,
  ) {}

  async execute(input: ReviewAnswerInput): Promise<ReviewAnswerResult> {
    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      if (room.currentStage !== 'ANSWER_REVIEW') {
        throw new UnexpectedGameStageError();
      }

      const active = await this.cells.findActiveByRoomId(room.id);
      if (!active || active.state !== 'OPENED') {
        throw new NoActiveCellError();
      }

      // §14.6 optional reveal: load the correct answer BEFORE any mutation or
      // emission so a missing question aborts the review with no side effects.
      let question: Question | null = null;
      if (input.revealAnswer === true) {
        question = await this.questions.findById(active.questionId);
        if (!question) {
          throw new QuestionNotFoundError();
        }
      }

      const answeredByTeamId = input.accepted ? active.openedByTeamId : null;
      active.block(this.clock.now(), answeredByTeamId); // OPENED → BLOCKED
      room.incrementBlockedQuestions();
      room.transitionTo('GAME_BOARD');

      const roomTeams = await this.teams.findByRoomId(room.id);
      const nextTeamId = this.moveToNextTurn(room, roomTeams);
      this.timer.clear(room.id);

      await this.cells.update(active);
      await this.rooms.update(room);

      this.realtime.emitToRoom(
        room.id,
        input.accepted
          ? GameplayEvent.AnswerAccepted
          : GameplayEvent.AnswerRejected,
        {
          roomId: room.id,
          cellId: active.id,
          teamId: active.openedByTeamId,
        },
      );
      // Reveal-gated, host sockets only (6.2b) — never a room-wide payload.
      if (question) {
        this.hostRealtime.emitToHost(
          room.id,
          GameplayEvent.QuestionCorrectAnswerShownToHost,
          {
            roomId: room.id,
            cellId: active.id,
            correctAnswer: question.correctAnswer,
          },
        );
      }
      this.realtime.emitToRoom(room.id, GameplayEvent.CellBlocked, {
        roomId: room.id,
        cellId: active.id,
        state: active.state,
        answeredByTeamId: active.answeredByTeamId,
      });
      this.realtime.emitToRoom(room.id, GameSessionEvent.GameTurnChanged, {
        roomId: room.id,
        currentTeamId: room.currentTeamId,
      });
      const cells = await this.cells.listByRoomId(room.id);
      this.realtime.emitToRoom(room.id, GameplayEvent.BoardStateUpdated, {
        roomId: room.id,
        cells: cells.map(boardCellSummary),
      });

      return { room, cell: active, nextTeamId };
    });
  }

  /**
   * Advance the turn to the next participant, round-robin by `turnOrder`
   * (participants are the teams with a non-null order assigned at game start).
   * Points the room at the next team and returns its id.
   */
  private moveToNextTurn(room: Room, roomTeams: Team[]): string | null {
    const participants = roomTeams
      .filter((team) => team.turnOrder !== null)
      .sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));
    if (participants.length === 0) {
      return room.currentTeamId;
    }
    const currentIndex = participants.findIndex(
      (team) => team.id === room.currentTeamId,
    );
    const next = participants[(currentIndex + 1) % participants.length];
    room.assignCurrentTeam(next.id);
    return next.id;
  }
}

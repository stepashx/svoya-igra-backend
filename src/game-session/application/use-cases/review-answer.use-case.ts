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
import {
  RoomNotActiveError,
  RoomNotFoundError,
  TeamNotFoundError,
} from '../../domain/errors';
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import {
  AnswerTimerRegistry,
  ShopTimerRegistry,
  ShopTimerState,
} from '../timers';
import {
  HOST_REALTIME_EVENTS_PORT,
  HostRealtimeEventsPort,
  TRANSACTION_PORT,
  TransactionPort,
} from '../ports';
import {
  CommerceEvent,
  GameSessionEvent,
  GameplayEvent,
  boardCellSummary,
} from '../events';

/** Every-Nth-blocked-question shop cadence (§14.8) — the Stage 8.2 policy. */
const SHOP_CADENCE = 6;

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
 * Shop cadence (§14.8, 8.2): when the post-increment blocked count hits a
 * {@link SHOP_CADENCE} multiple — or the board is exhausted — the room enters
 * SHOP instead of GAME_BOARD, the {@link ShopTimerRegistry} starts (fresh
 * stamps on every entry) and `shop-opened` (or `shop-final-opened` on the
 * exhausted board) is appended LAST to the broadcast block. The turn still
 * moves (Этап2 §16) and a REJECTED review reaches the threshold too — the
 * cadence counts blocked cells, not correct answers.
 *
 * On an accepted answer the OPENING team scores (§14.7): `earnedScore` and
 * `balance` both grow by the cell's points and `score-changed` follows
 * `answer-accepted` room-wide; a rejected answer changes no score and emits no
 * `score-changed`. Broadcasts (room-wide): `answer-accepted` /
 * `answer-rejected` (+ `score-changed` on accept), `cell-blocked`,
 * `game-turn-changed` (the shared game-session name), `board-state-updated`
 * and, on a shop entry, `shop-opened`/`shop-final-opened` last.
 * With `revealAnswer` the correct answer additionally goes to the host's
 * sockets only (`question-correct-answer-shown-to-host` via
 * {@link HostRealtimeEventsPort}, 6.2b) — it never enters a room-wide payload
 * (§16.4 secrecy).
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
    private readonly shopTimer: ShopTimerRegistry,
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
      // §14.8 shop cadence, read AFTER the increment: every SHOP_CADENCE-th
      // blocked cell (and the exhausted board) opens the shop; anything else
      // returns to the board exactly as before 8.2.
      const entersShop =
        room.isBoardExhausted ||
        room.blockedQuestionsCount % SHOP_CADENCE === 0;
      if (entersShop) {
        room.enterShop();
      } else {
        room.transitionTo('GAME_BOARD');
      }

      const roomTeams = await this.teams.findByRoomId(room.id);
      // §14.7 scoring on accept: the OPENING team (not the current turn
      // holder) earns the cell's denormalized points on BOTH scores. A missing
      // opener is an impossible state for an OPENED cell — tripwire.
      let scoringTeam: Team | null = null;
      if (input.accepted) {
        scoringTeam =
          roomTeams.find((team) => team.id === active.openedByTeamId) ?? null;
        if (!scoringTeam) {
          throw new TeamNotFoundError();
        }
        scoringTeam.awardPoints(active.points);
      }
      const nextTeamId = this.moveToNextTurn(room, roomTeams);
      this.timer.clear(room.id);

      await this.cells.update(active);
      await this.rooms.update(room);
      if (scoringTeam) {
        await this.teams.update(scoringTeam);
      }

      // Started UNCONDITIONALLY on every entry (round 2 on the 12th block gets
      // fresh endsAt/minClosableAt), at the open-question timer.start position.
      let shopState: ShopTimerState | null = null;
      if (entersShop) {
        shopState = this.shopTimer.start(room.id, this.clock.now());
      }

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
      if (scoringTeam) {
        this.realtime.emitToRoom(room.id, GameplayEvent.ScoreChanged, {
          roomId: room.id,
          teamId: scoringTeam.id,
          earnedScore: scoringTeam.earnedScore.value,
          balance: scoringTeam.balance.value,
          delta: active.points,
        });
      }
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
      // Shop entry (8.2): appended LAST — the six broadcasts above are the
      // pre-8.2 contract and stay untouched. Finality picks the event name.
      if (shopState) {
        this.realtime.emitToRoom(
          room.id,
          room.isBoardExhausted
            ? CommerceEvent.ShopFinalOpened
            : CommerceEvent.ShopOpened,
          {
            roomId: room.id,
            currentShopRound: room.currentShopRound,
            startedAt: shopState.startedAt,
            endsAt: shopState.endsAt,
            minClosableAt: shopState.minClosableAt,
          },
        );
      }

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

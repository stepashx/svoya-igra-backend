import {
  InvalidQuestionCountsError,
  InvalidStageTransitionError,
  RoomNotActiveError,
} from '../errors';
import { GameStage, RoomStatus } from '../types';
import { ReconnectToken, RoomCode } from '../value-objects';

/** Default size of the question board (plan §14.4: 6 categories × 5). */
const DEFAULT_TOTAL_QUESTIONS = 30;

/**
 * Legal stage flow (plan §13 / Этап2 §9). Each stage maps to the set of stages
 * it may advance to; a transition is legal iff the target is in that set. The
 * lobby path (LOBBY → TEAM_SETUP → READY_CHECK → GAME_BOARD) is linear; the
 * board loop branches — ANSWER_REVIEW returns to GAME_BOARD or enters SHOP, and
 * SHOP returns to GAME_BOARD or, once the board is exhausted, moves on to
 * PRESENTATION_PREPARATION (the final shop, 8.2). The presentation phase is
 * linear: PRESENTATION_PREPARATION → PRESENTATION_DEFENSE (StartDefense opens
 * the defenses, 10.1) → EVALUATION (the last presenter finishes/skips, 10.1).
 * The later edges (EVALUATION → RESULTS → FINISHED) arrive with Stage 10.3.
 */
const STAGE_FLOW: Readonly<Partial<Record<GameStage, readonly GameStage[]>>> = {
  LOBBY: ['TEAM_SETUP'],
  TEAM_SETUP: ['READY_CHECK'],
  READY_CHECK: ['GAME_BOARD'],
  GAME_BOARD: ['QUESTION_OPENED'],
  QUESTION_OPENED: ['ANSWER_REVIEW'],
  ANSWER_REVIEW: ['GAME_BOARD', 'SHOP'],
  SHOP: ['GAME_BOARD', 'PRESENTATION_PREPARATION'],
  PRESENTATION_PREPARATION: ['PRESENTATION_DEFENSE'],
  PRESENTATION_DEFENSE: ['EVALUATION'],
};

/** Fields required to start a brand-new room (caller-supplied id and identity). */
export interface RoomCreateProps {
  id: string;
  code: RoomCode;
  hostId: string;
  hostReconnectToken: ReconnectToken;
}

/** Full persisted state used to rehydrate a room from the database. */
export interface RoomReconstituteProps {
  id: string;
  code: RoomCode;
  status: RoomStatus;
  currentStage: GameStage;
  hostId: string;
  hostReconnectToken: ReconnectToken;
  currentTeamId: string | null;
  totalQuestionsCount: number;
  blockedQuestionsCount: number;
  currentShopRound: number;
  createdAt: Date;
  finishedAt: Date | null;
}

/**
 * The room aggregate root (plan §12) — owner of one play session. Sub-stage 5.1
 * models the lobby slice: identity, the linear lobby stage machine, the active
 * team pointer and room closure. Scoring, board and shop mutators arrive later.
 */
export class Room {
  private constructor(
    private readonly _id: string,
    private readonly _code: RoomCode,
    private _status: RoomStatus,
    private _currentStage: GameStage,
    private readonly _hostId: string,
    private readonly _hostReconnectToken: ReconnectToken,
    private _currentTeamId: string | null,
    private readonly _totalQuestionsCount: number,
    private _blockedQuestionsCount: number,
    private _currentShopRound: number,
    private readonly _createdAt: Date,
    private _finishedAt: Date | null,
  ) {
    this.assertQuestionCounts();
  }

  /** Create a fresh room: ACTIVE + LOBBY, no active team, full board. */
  static create(props: RoomCreateProps, now: Date): Room {
    return new Room(
      props.id,
      props.code,
      'ACTIVE',
      'LOBBY',
      props.hostId,
      props.hostReconnectToken,
      null,
      DEFAULT_TOTAL_QUESTIONS,
      0,
      0,
      now,
      null,
    );
  }

  /** Rehydrate a room from persisted state (used by the mapper). */
  static reconstitute(props: RoomReconstituteProps): Room {
    return new Room(
      props.id,
      props.code,
      props.status,
      props.currentStage,
      props.hostId,
      props.hostReconnectToken,
      props.currentTeamId,
      props.totalQuestionsCount,
      props.blockedQuestionsCount,
      props.currentShopRound,
      props.createdAt,
      props.finishedAt,
    );
  }

  /** Advance to a legal next stage; reject any transition not in the flow. */
  transitionTo(next: GameStage): void {
    const allowed = STAGE_FLOW[this._currentStage] ?? [];
    if (!allowed.includes(next)) {
      throw new InvalidStageTransitionError(this._currentStage, next);
    }
    this._currentStage = next;
  }

  /** Point the room at the team whose turn it is. */
  assignCurrentTeam(teamId: string): void {
    this._currentTeamId = teamId;
  }

  /**
   * Record one more blocked cell after the host reviews an answer (plan §14.4 —
   * a cell is blocked on both correct and incorrect outcomes). Guards the same
   * invariant the constructor asserts: the blocked count never exceeds the board
   * size, so a board that is already fully blocked rejects a further increment.
   */
  incrementBlockedQuestions(): void {
    if (this._blockedQuestionsCount >= this._totalQuestionsCount) {
      throw new InvalidQuestionCountsError();
    }
    this._blockedQuestionsCount += 1;
  }

  /**
   * Enter the shop (§14.8): ANSWER_REVIEW → SHOP plus one more shop round.
   * The transition runs FIRST — an illegal source stage throws
   * {@link InvalidStageTransitionError} before the round counter moves, so a
   * rejected entry never grows the count. No upper bound here: the every-6th-
   * question cadence (and its cap) is the Stage 8.2 use-case policy, not an
   * entity invariant.
   */
  enterShop(): void {
    this.transitionTo('SHOP');
    this._currentShopRound += 1;
  }

  /**
   * Leave the shop for the next board loop (§14.8): SHOP → GAME_BOARD. A thin
   * mutator with no exhaustion guard — WHICH exit applies (regular vs final)
   * is the CloseShop use-case policy, decided from {@link isBoardExhausted}.
   */
  exitShop(): void {
    this.transitionTo('GAME_BOARD');
  }

  /**
   * Leave the FINAL shop for the presentation phase (§14.8): SHOP →
   * PRESENTATION_PREPARATION. Thin like {@link exitShop} — finality is never
   * stored, it is derived ({@link isBoardExhausted}) and chosen by CloseShop.
   */
  finalizeShop(): void {
    this.transitionTo('PRESENTATION_PREPARATION');
  }

  /** Host-initiated closure: the room leaves ACTIVE for CLOSED. */
  close(now: Date): void {
    this.assertActive();
    this._status = 'CLOSED';
    this._finishedAt = now;
  }

  /** The game ran to completion: the room leaves ACTIVE for FINISHED. */
  markFinished(now: Date): void {
    this.assertActive();
    this._status = 'FINISHED';
    this._finishedAt = now;
  }

  /** Terminal-state guard: closure/finish are legal only from ACTIVE. */
  private assertActive(): void {
    if (this._status !== 'ACTIVE') {
      throw new RoomNotActiveError();
    }
  }

  private assertQuestionCounts(): void {
    if (this._blockedQuestionsCount > this._totalQuestionsCount) {
      throw new InvalidQuestionCountsError();
    }
  }

  get id(): string {
    return this._id;
  }

  get code(): RoomCode {
    return this._code;
  }

  get status(): RoomStatus {
    return this._status;
  }

  get currentStage(): GameStage {
    return this._currentStage;
  }

  get hostId(): string {
    return this._hostId;
  }

  get hostReconnectToken(): ReconnectToken {
    return this._hostReconnectToken;
  }

  get currentTeamId(): string | null {
    return this._currentTeamId;
  }

  get totalQuestionsCount(): number {
    return this._totalQuestionsCount;
  }

  get blockedQuestionsCount(): number {
    return this._blockedQuestionsCount;
  }

  /**
   * Whether every board cell is blocked (§14.8) — derived from the two
   * persisted counters, never stored itself. Drives the FINAL shop: the 8.2
   * use cases pick `shop-final-opened` over `shop-opened` and
   * {@link finalizeShop} over {@link exitShop} off this flag.
   */
  get isBoardExhausted(): boolean {
    return this._blockedQuestionsCount >= this._totalQuestionsCount;
  }

  get currentShopRound(): number {
    return this._currentShopRound;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get finishedAt(): Date | null {
    return this._finishedAt;
  }
}

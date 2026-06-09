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
 * Linear lobby stage flow (plan §13 / Этап2 §9). Each stage maps to its single
 * legal successor; branching transitions (SHOP loop, presentation, evaluation)
 * arrive with later sub-stages. A transition is legal iff the target equals the
 * mapped successor of the current stage.
 */
const LOBBY_STAGE_FLOW: Readonly<Partial<Record<GameStage, GameStage>>> = {
  LOBBY: 'TEAM_SETUP',
  TEAM_SETUP: 'READY_CHECK',
  READY_CHECK: 'GAME_BOARD',
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

  /** Advance to the next lobby stage; reject any transition not in the flow. */
  transitionTo(next: GameStage): void {
    const successor = LOBBY_STAGE_FLOW[this._currentStage];
    if (successor !== next) {
      throw new InvalidStageTransitionError(this._currentStage, next);
    }
    this._currentStage = next;
  }

  /** Point the room at the team whose turn it is. */
  assignCurrentTeam(teamId: string): void {
    this._currentTeamId = teamId;
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

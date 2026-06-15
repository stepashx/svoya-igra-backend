import {
  CaptainAlreadyAssignedError,
  InsufficientBalanceError,
  InvalidScoreError,
} from '../errors';
import { Score, TeamName } from '../value-objects';

/** Fields required to create a brand-new team (caller-supplied id). */
export interface TeamCreateProps {
  id: string;
  roomId: string;
  name: TeamName;
}

/** Full persisted state used to rehydrate a team from the database. */
export interface TeamReconstituteProps {
  id: string;
  roomId: string;
  name: TeamName;
  captainPlayerId: string | null;
  selectedTopicId: string | null;
  isReady: boolean;
  turnOrder: number | null;
  earnedScore: Score;
  balance: Score;
  presentationSubmissionId: string | null;
  createdAt: Date;
}

/**
 * A team within a room (plan §12). `captainPlayerId` is the authoritative
 * captain link (assign-once: a second assignment throws). Keeps two scores per
 * §14.7 — `earnedScore` (final result) and `balance` (after purchases) — both as
 * non-negative {@link Score} value objects; {@link awardPoints} grows BOTH
 * together on an accepted answer, {@link debitBalance} shrinks ONLY `balance`
 * on a purchase ({@link canAfford} is the read-side predicate).
 * `turnOrder` is a flat nullable number (its value object is deferred).
 */
export class Team {
  private constructor(
    private readonly _id: string,
    private readonly _roomId: string,
    private readonly _name: TeamName,
    private _captainPlayerId: string | null,
    private _selectedTopicId: string | null,
    private _isReady: boolean,
    private _turnOrder: number | null,
    private _earnedScore: Score,
    private _balance: Score,
    private _presentationSubmissionId: string | null,
    private readonly _createdAt: Date,
  ) {}

  /** Create a fresh team: no captain, no topic, not ready, zero scores. */
  static create(props: TeamCreateProps, now: Date): Team {
    return new Team(
      props.id,
      props.roomId,
      props.name,
      null,
      null,
      false,
      null,
      Score.create(0),
      Score.create(0),
      null,
      now,
    );
  }

  /** Rehydrate a team from persisted state (used by the mapper). */
  static reconstitute(props: TeamReconstituteProps): Team {
    return new Team(
      props.id,
      props.roomId,
      props.name,
      props.captainPlayerId,
      props.selectedTopicId,
      props.isReady,
      props.turnOrder,
      props.earnedScore,
      props.balance,
      props.presentationSubmissionId,
      props.createdAt,
    );
  }

  /** Assign the captain. Authoritative and assign-once — re-assigning throws. */
  assignCaptain(playerId: string): void {
    if (this._captainPlayerId !== null) {
      throw new CaptainAlreadyAssignedError();
    }
    this._captainPlayerId = playerId;
  }

  selectTopic(topicId: string): void {
    this._selectedTopicId = topicId;
  }

  clearTopic(): void {
    this._selectedTopicId = null;
  }

  markReady(): void {
    this._isReady = true;
  }

  markNotReady(): void {
    this._isReady = false;
  }

  assignTurnOrder(turnOrder: number | null): void {
    this._turnOrder = turnOrder;
  }

  /**
   * Award §14.7 points for an accepted answer: `earnedScore` AND `balance`
   * always grow together by the same positive integer amount. Zero or
   * fractional awards are rejected ({@link InvalidScoreError}).
   */
  awardPoints(points: number): void {
    if (!Number.isInteger(points) || points <= 0) {
      throw new InvalidScoreError('Awarded points must be a positive integer.');
    }
    this._earnedScore = this._earnedScore.add(points);
    this._balance = this._balance.add(points);
  }

  /**
   * Debit a §14.7 purchase from `balance` ONLY — `earnedScore` is the final
   * result and never shrinks. Zero or fractional prices are rejected
   * ({@link InvalidScoreError}); a price above the current balance is rejected
   * ({@link InsufficientBalanceError}) before any mutation.
   */
  debitBalance(price: number): void {
    if (!Number.isInteger(price) || price <= 0) {
      throw new InvalidScoreError('Debited price must be a positive integer.');
    }
    if (this._balance.value < price) {
      throw new InsufficientBalanceError();
    }
    this._balance = this._balance.subtract(price);
  }

  /**
   * Read-side affordability predicate (no guards, no mutation): whether the
   * current balance covers `price`. The write path re-checks inside
   * {@link debitBalance} — this is for queries/availability views.
   */
  canAfford(price: number): boolean {
    return this._balance.value >= price;
  }

  /**
   * Link the team to its (latest) presentation submission (§9.3). A plain
   * overwrite, NOT assign-once: a re-upload reuses the same submission id and
   * re-attaches it, and the row is replaced in place — so there is no second
   * distinct submission to guard against. The authoritative submission row
   * carries its own (room, team) uniqueness; this is the denormalised link.
   */
  attachSubmission(submissionId: string): void {
    this._presentationSubmissionId = submissionId;
  }

  get id(): string {
    return this._id;
  }

  get roomId(): string {
    return this._roomId;
  }

  get name(): TeamName {
    return this._name;
  }

  get captainPlayerId(): string | null {
    return this._captainPlayerId;
  }

  get selectedTopicId(): string | null {
    return this._selectedTopicId;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get turnOrder(): number | null {
    return this._turnOrder;
  }

  get earnedScore(): Score {
    return this._earnedScore;
  }

  get balance(): Score {
    return this._balance;
  }

  get presentationSubmissionId(): string | null {
    return this._presentationSubmissionId;
  }

  get createdAt(): Date {
    return this._createdAt;
  }
}

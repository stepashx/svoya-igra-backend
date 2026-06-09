import { CaptainAlreadyAssignedError } from '../errors';
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
 * non-negative {@link Score} value objects; scoring arithmetic arrives later.
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

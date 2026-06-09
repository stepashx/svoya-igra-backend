import { ConnectionStatus } from '../types';
import { PlayerName, ReconnectToken } from '../value-objects';

/** Fields required to create a brand-new player (caller-supplied id). */
export interface PlayerCreateProps {
  id: string;
  roomId: string;
  name: PlayerName;
  reconnectToken: ReconnectToken;
}

/** Full persisted state used to rehydrate a player from the database. */
export interface PlayerReconstituteProps {
  id: string;
  roomId: string;
  teamId: string | null;
  name: PlayerName;
  avatar: string | null;
  reconnectToken: ReconnectToken;
  connectionStatus: ConnectionStatus;
  isCaptain: boolean;
  joinedAt: Date;
  lastSeenAt: Date;
}

/**
 * A player in a room (plan §12). Team membership is a mutable link (a player
 * exists before joining a team). `isCaptain` is the denormalised captaincy flag;
 * the authoritative captain link lives on {@link Team} (`captainPlayerId`). Per
 * the brief, captaincy is promote-only and idempotent — there is no demote.
 */
export class Player {
  private constructor(
    private readonly _id: string,
    private readonly _roomId: string,
    private _teamId: string | null,
    private _name: PlayerName,
    private _avatar: string | null,
    private readonly _reconnectToken: ReconnectToken,
    private _connectionStatus: ConnectionStatus,
    private _isCaptain: boolean,
    private readonly _joinedAt: Date,
    private _lastSeenAt: Date,
  ) {}

  /** Create a fresh player: unassigned, connected, not a captain. */
  static create(props: PlayerCreateProps, now: Date): Player {
    return new Player(
      props.id,
      props.roomId,
      null,
      props.name,
      null,
      props.reconnectToken,
      'CONNECTED',
      false,
      now,
      now,
    );
  }

  /** Rehydrate a player from persisted state (used by the mapper). */
  static reconstitute(props: PlayerReconstituteProps): Player {
    return new Player(
      props.id,
      props.roomId,
      props.teamId,
      props.name,
      props.avatar,
      props.reconnectToken,
      props.connectionStatus,
      props.isCaptain,
      props.joinedAt,
      props.lastSeenAt,
    );
  }

  joinTeam(teamId: string): void {
    this._teamId = teamId;
  }

  leaveTeam(): void {
    this._teamId = null;
  }

  rename(name: PlayerName): void {
    this._name = name;
  }

  changeAvatar(avatar: string | null): void {
    this._avatar = avatar;
  }

  /** Promote to captain. Idempotent and one-way — never demotes. */
  promoteToCaptain(): void {
    this._isCaptain = true;
  }

  markConnected(now: Date): void {
    this._connectionStatus = 'CONNECTED';
    this._lastSeenAt = now;
  }

  markDisconnected(now: Date): void {
    this._connectionStatus = 'DISCONNECTED';
    this._lastSeenAt = now;
  }

  /** Bump the activity timestamp without changing connection status. */
  touch(now: Date): void {
    this._lastSeenAt = now;
  }

  get id(): string {
    return this._id;
  }

  get roomId(): string {
    return this._roomId;
  }

  get teamId(): string | null {
    return this._teamId;
  }

  get name(): PlayerName {
    return this._name;
  }

  get avatar(): string | null {
    return this._avatar;
  }

  get reconnectToken(): ReconnectToken {
    return this._reconnectToken;
  }

  get connectionStatus(): ConnectionStatus {
    return this._connectionStatus;
  }

  get isCaptain(): boolean {
    return this._isCaptain;
  }

  get joinedAt(): Date {
    return this._joinedAt;
  }

  get lastSeenAt(): Date {
    return this._lastSeenAt;
  }
}

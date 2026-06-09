import {
  CellAlreadyBlockedError,
  CellNotAvailableError,
  InvalidBoardCellTransitionError,
} from '../errors';
import { BoardCellState } from '../types';

/**
 * Fields required to seed a fresh board cell at board-init. The id is
 * caller-supplied (IdGeneratorPort); the question/category/points/position are
 * copied from the seed catalog. State and the actor links are not passed — a new
 * cell is always AVAILABLE with no actors yet.
 */
export interface BoardCellCreateProps {
  id: string;
  roomId: string;
  questionId: string;
  categoryId: string;
  points: number;
  position: number;
}

/** Full persisted state used to rehydrate a board cell from the database. */
export interface BoardCellReconstituteProps {
  id: string;
  roomId: string;
  questionId: string;
  categoryId: string;
  points: number;
  position: number;
  state: BoardCellState;
  openedByTeamId: string | null;
  answeredByTeamId: string | null;
  blockedAt: Date | null;
}

/**
 * One cell of a room's 6×5 board (plan §12). Owns its own lifecycle state
 * machine: AVAILABLE → SELECTED → OPENED → BLOCKED. The active team's captain
 * SELECTs an available cell, OPENing it reveals the question and records who
 * opened it, and the host BLOCKs it after the answer review (recording the
 * timestamp and which team, if any, answered correctly).
 *
 * `create` seeds a fresh AVAILABLE cell (no timestamp — the table has no
 * `created_at`; `blockedAt` is an event stamp set only on block). The transition
 * methods reject illegal moves so an invalid board state can never be persisted.
 * No Nest/Drizzle here — pure domain.
 */
export class BoardCell {
  private constructor(
    private readonly _id: string,
    private readonly _roomId: string,
    private readonly _questionId: string,
    private readonly _categoryId: string,
    private readonly _points: number,
    private readonly _position: number,
    private _state: BoardCellState,
    private _openedByTeamId: string | null,
    private _answeredByTeamId: string | null,
    private _blockedAt: Date | null,
  ) {}

  /** Seed a fresh cell: AVAILABLE, no opener, no answerer, not blocked. */
  static create(props: BoardCellCreateProps): BoardCell {
    return new BoardCell(
      props.id,
      props.roomId,
      props.questionId,
      props.categoryId,
      props.points,
      props.position,
      'AVAILABLE',
      null,
      null,
      null,
    );
  }

  /** Rehydrate a cell from persisted state (used by the mapper). */
  static reconstitute(props: BoardCellReconstituteProps): BoardCell {
    return new BoardCell(
      props.id,
      props.roomId,
      props.questionId,
      props.categoryId,
      props.points,
      props.position,
      props.state,
      props.openedByTeamId,
      props.answeredByTeamId,
      props.blockedAt,
    );
  }

  /** Active team picks this cell: AVAILABLE → SELECTED. */
  select(): void {
    if (this._state !== 'AVAILABLE') {
      throw new CellNotAvailableError();
    }
    this._state = 'SELECTED';
  }

  /** Reveal the question: SELECTED → OPENED, recording who opened it. */
  open(openedByTeamId: string): void {
    if (this._state !== 'SELECTED') {
      throw new InvalidBoardCellTransitionError(this._state, 'OPENED');
    }
    this._state = 'OPENED';
    this._openedByTeamId = openedByTeamId;
  }

  /**
   * Close the cell after answer review: OPENED → BLOCKED, stamping the moment
   * and the team that answered correctly (`null` when none did). Re-blocking is
   * a distinct rule violation from blocking a cell that was never opened.
   */
  block(now: Date, answeredByTeamId: string | null): void {
    if (this._state === 'BLOCKED') {
      throw new CellAlreadyBlockedError();
    }
    if (this._state !== 'OPENED') {
      throw new InvalidBoardCellTransitionError(this._state, 'BLOCKED');
    }
    this._state = 'BLOCKED';
    this._blockedAt = now;
    this._answeredByTeamId = answeredByTeamId;
  }

  get id(): string {
    return this._id;
  }

  get roomId(): string {
    return this._roomId;
  }

  get questionId(): string {
    return this._questionId;
  }

  get categoryId(): string {
    return this._categoryId;
  }

  get points(): number {
    return this._points;
  }

  get position(): number {
    return this._position;
  }

  get state(): BoardCellState {
    return this._state;
  }

  get openedByTeamId(): string | null {
    return this._openedByTeamId;
  }

  get answeredByTeamId(): string | null {
    return this._answeredByTeamId;
  }

  get blockedAt(): Date | null {
    return this._blockedAt;
  }
}

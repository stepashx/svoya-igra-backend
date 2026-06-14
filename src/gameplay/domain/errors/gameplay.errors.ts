import {
  DomainRuleError,
  ForbiddenError,
  NotFoundError,
} from '../../../core/errors/app.error';

/**
 * Gameplay domain error catalog. Each error extends the semantic base that fixes
 * its HTTP category ({@link NotFoundError} → 404, {@link ForbiddenError} → 403,
 * {@link DomainRuleError} → 409) and narrows `code` to its own stable,
 * machine-readable identifier. The {@link AllExceptionsFilter} maps by base
 * class, so adding an error here needs no filter change.
 *
 * The full catalog is declared in sub-stage 6.1 so later sub-stages need not
 * touch this file. Only a subset is actually thrown in 6.1: the board-cell
 * transition guards ({@link CellNotAvailableError}, {@link CellAlreadyBlockedError},
 * {@link InvalidBoardCellTransitionError}) and the board-init catalog check
 * ({@link BoardCatalogIncompleteError}). The rest are reserved for the combat
 * use cases (6.2).
 */

/* -------------------------------------------------------------------------- */
/* Not-found category (→ HTTP 404).                                           */
/* -------------------------------------------------------------------------- */

/** A question could not be found. */
export class QuestionNotFoundError extends NotFoundError {
  readonly code = 'QUESTION_NOT_FOUND';

  constructor(message = 'Question not found.') {
    super(message);
  }
}

/** A category could not be found. */
export class CategoryNotFoundError extends NotFoundError {
  readonly code = 'CATEGORY_NOT_FOUND';

  constructor(message = 'Category not found.') {
    super(message);
  }
}

/** A board cell could not be found. */
export class BoardCellNotFoundError extends NotFoundError {
  readonly code = 'BOARD_CELL_NOT_FOUND';

  constructor(message = 'Board cell not found.') {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Forbidden category (→ HTTP 403).                                           */
/* -------------------------------------------------------------------------- */

/**
 * The acting player is not the captain of the team whose turn it is. Reserved
 * for the combat use cases (6.2) that gate board actions behind the active
 * team's captain.
 */
export class NotActiveTeamCaptainError extends ForbiddenError {
  readonly code = 'NOT_ACTIVE_TEAM_CAPTAIN';

  constructor(
    message = 'Only the active team captain may perform this action.',
  ) {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Domain-rule category (→ HTTP 409).                                         */
/* -------------------------------------------------------------------------- */

/**
 * A stage-gated action was attempted while the room was in the wrong stage
 * (e.g. selecting a cell outside GAME_BOARD, submitting outside
 * QUESTION_OPENED, or closing the shop outside SHOP). Thrown by the combat
 * use cases (6.2) and the shop close (8.2) before they touch any state.
 */
export class UnexpectedGameStageError extends DomainRuleError {
  readonly code = 'UNEXPECTED_GAME_STAGE';

  constructor(
    message = 'The room is not in the expected stage for this action.',
  ) {
    super(message);
  }
}

/**
 * A team tried to submit after the answer timer had already expired (lazy
 * ClockPort check at submit time; no server scheduler). The stage does not
 * advance — the host bridges the timeout via the advance endpoint instead.
 */
export class AnswerTimeExpiredError extends DomainRuleError {
  readonly code = 'ANSWER_TIME_EXPIRED';

  constructor(message = 'The answer time has expired.') {
    super(message);
  }
}

/**
 * A host action (open/reject/review) expected an active cell — one in the
 * SELECTED or OPENED state — but none was found for the room.
 */
export class NoActiveCellError extends DomainRuleError {
  readonly code = 'NO_ACTIVE_CELL';

  constructor(message = 'There is no active cell for this room.') {
    super(message);
  }
}

/**
 * The captain tried to select a cell while another cell is already SELECTED or
 * OPENED. The "one active cell per room" invariant is enforced in the use case
 * under the per-room lock (the table carries no unique index — see §19).
 */
export class CellSelectionInProgressError extends DomainRuleError {
  readonly code = 'CELL_SELECTION_IN_PROGRESS';

  constructor(message = 'A cell selection is already in progress.') {
    super(message);
  }
}

/** Attempted to select a cell that is not AVAILABLE. */
export class CellNotAvailableError extends DomainRuleError {
  readonly code = 'CELL_NOT_AVAILABLE';

  constructor(message = 'The board cell is not available.') {
    super(message);
  }
}

/** Attempted to block a cell that is already BLOCKED. */
export class CellAlreadyBlockedError extends DomainRuleError {
  readonly code = 'CELL_ALREADY_BLOCKED';

  constructor(message = 'The board cell is already blocked.') {
    super(message);
  }
}

/** Attempted a board-cell state transition that is not legal from its state. */
export class InvalidBoardCellTransitionError extends DomainRuleError {
  readonly code = 'INVALID_BOARD_CELL_TRANSITION';

  constructor(from?: string, to?: string) {
    super(
      from && to
        ? `Illegal board cell transition: ${from} → ${to}.`
        : 'Illegal board cell transition.',
    );
  }
}

/**
 * Board-init was invoked for a room whose board already exists. Declared in 6.1
 * for completeness; board-init currently takes the idempotent skip-if-exists
 * path instead of throwing, so this is reserved for a stricter caller.
 */
export class BoardAlreadyInitializedError extends DomainRuleError {
  readonly code = 'BOARD_ALREADY_INITIALIZED';

  constructor(message = 'The board is already initialized for this room.') {
    super(message);
  }
}

/**
 * The seeded question catalog did not contain the expected 30 questions, so a
 * full 6×5 board cannot be built. Thrown by board-init.
 */
export class BoardCatalogIncompleteError extends DomainRuleError {
  readonly code = 'BOARD_CATALOG_INCOMPLETE';

  constructor(
    message = 'The question catalog is incomplete; cannot build the board.',
  ) {
    super(message);
  }
}

import { AppError } from '../../../core/errors/app.error';

/**
 * Lobby domain error catalog.
 *
 * DESIGN NOTE (deviation from the 5.1 brief — see report open question OQ-1):
 * the brief asked these to extend the core concrete errors
 * (`NotFoundError` / `DomainRuleError` / `ValidationError`). Those classes
 * initialise `readonly code = '...'`, which narrows their `code` property to a
 * STRING LITERAL. TypeScript then forbids any subclass from re-declaring `code`
 * with a different value (TS2416), and every alternative — getter override
 * (TS2611), `declare`-widening (TS2416) or constructor reassignment (poisons the
 * static type of `.code`, TS2367 at read sites) — fails to compile cleanly.
 * Fixing it properly means widening the base `code` to `string`, which lives in
 * `core/errors/app.error.ts` and is out of 5.1 scope. So the catalog extends
 * `AppError` directly and the intended HTTP category is documented per group;
 * the current {@link AllExceptionsFilter} already maps by `instanceof AppError`
 * + `code`, so behaviour is unaffected. Re-parenting under the core errors is a
 * one-line change once the base widens.
 */

/* -------------------------------------------------------------------------- */
/* Validation category (→ HTTP 400) — thrown in 5.1.                          */
/* -------------------------------------------------------------------------- */

/** A room code failed value-object validation. */
export class InvalidRoomCodeError extends AppError {
  readonly code = 'ROOM_CODE_INVALID';

  constructor(message = 'Room code is invalid.') {
    super(message);
  }
}

/** A reconnect token failed value-object validation. */
export class InvalidReconnectTokenError extends AppError {
  readonly code = 'RECONNECT_TOKEN_INVALID';

  constructor(message = 'Reconnect token is invalid.') {
    super(message);
  }
}

/** A player name failed value-object validation. */
export class InvalidPlayerNameError extends AppError {
  readonly code = 'PLAYER_NAME_INVALID';

  constructor(message = 'Player name is invalid.') {
    super(message);
  }
}

/** A team name failed value-object validation. */
export class InvalidTeamNameError extends AppError {
  readonly code = 'TEAM_NAME_INVALID';

  constructor(message = 'Team name is invalid.') {
    super(message);
  }
}

/** A score failed value-object validation (non-integer or negative). */
export class InvalidScoreError extends AppError {
  readonly code = 'SCORE_INVALID';

  constructor(message = 'Score is invalid.') {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Domain-rule category (→ HTTP 409) — thrown in 5.1.                         */
/* -------------------------------------------------------------------------- */

/** Attempted to assign a captain to a team that already has one. */
export class CaptainAlreadyAssignedError extends AppError {
  readonly code = 'CAPTAIN_ALREADY_ASSIGNED';

  constructor(message = 'A captain is already assigned to this team.') {
    super(message);
  }
}

/** Attempted a stage transition that is not legal from the current stage. */
export class InvalidStageTransitionError extends AppError {
  readonly code = 'INVALID_STAGE_TRANSITION';

  constructor(from?: string, to?: string) {
    super(
      from && to
        ? `Illegal stage transition: ${from} → ${to}.`
        : 'Illegal stage transition.',
    );
  }
}

/**
 * A room was constructed with `blockedQuestionsCount > totalQuestionsCount`.
 * NOTE: not in the brief's catalog list, but the brief mandates this Room
 * invariant and the core `DomainRuleError` is not directly instantiable (its
 * constructor is inherited `protected`). Added here to keep the invariant typed
 * and envelope-mappable. See report open question OQ-2.
 */
export class InvalidQuestionCountsError extends AppError {
  readonly code = 'QUESTION_COUNTS_INVALID';

  constructor(
    message = 'blockedQuestionsCount cannot exceed totalQuestionsCount.',
  ) {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Not-found category (→ HTTP 404) — declared for 5.2; not thrown in 5.1.     */
/* -------------------------------------------------------------------------- */

/** A room could not be found. */
export class RoomNotFoundError extends AppError {
  readonly code = 'ROOM_NOT_FOUND';

  constructor(message = 'Room not found.') {
    super(message);
  }
}

/** A player could not be found. */
export class PlayerNotFoundError extends AppError {
  readonly code = 'PLAYER_NOT_FOUND';

  constructor(message = 'Player not found.') {
    super(message);
  }
}

/** A team could not be found. */
export class TeamNotFoundError extends AppError {
  readonly code = 'TEAM_NOT_FOUND';

  constructor(message = 'Team not found.') {
    super(message);
  }
}

/** A presentation topic could not be found. */
export class TopicNotFoundError extends AppError {
  readonly code = 'TOPIC_NOT_FOUND';

  constructor(message = 'Topic not found.') {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Domain-rule category (→ HTTP 409) — declared for 5.2; not thrown in 5.1.   */
/* -------------------------------------------------------------------------- */

/** A player with the same name already exists in the room. */
export class PlayerNameTakenError extends AppError {
  readonly code = 'PLAYER_NAME_TAKEN';

  constructor(message = 'A player with this name already exists in the room.') {
    super(message);
  }
}

/** The chosen topic is already selected by another team in the room. */
export class TopicAlreadyTakenError extends AppError {
  readonly code = 'TOPIC_ALREADY_TAKEN';

  constructor(message = 'This topic is already taken in the room.') {
    super(message);
  }
}

/** The room has reached its maximum number of teams. */
export class TeamLimitReachedError extends AppError {
  readonly code = 'TEAM_LIMIT_REACHED';

  constructor(message = 'The room has reached its team limit.') {
    super(message);
  }
}

/** The team has reached its maximum number of players. */
export class TeamFullError extends AppError {
  readonly code = 'TEAM_FULL';

  constructor(message = 'The team is full.') {
    super(message);
  }
}

/** Not enough ready teams to start the game. */
export class NotEnoughReadyTeamsError extends AppError {
  readonly code = 'NOT_ENOUGH_READY_TEAMS';

  constructor(message = 'Not enough ready teams to start the game.') {
    super(message);
  }
}

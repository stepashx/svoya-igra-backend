import {
  DomainRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../core/errors/app.error';

/**
 * Lobby domain error catalog. Each error extends the semantic base that fixes
 * its HTTP category ({@link ValidationError} → 400, {@link NotFoundError} → 404,
 * {@link ForbiddenError} → 403, {@link DomainRuleError} → 409) and narrows `code`
 * to its own stable, machine-readable identifier. The {@link AllExceptionsFilter}
 * maps by base class, so adding an error here needs no filter change.
 */

/* -------------------------------------------------------------------------- */
/* Validation category (→ HTTP 400).                                          */
/* -------------------------------------------------------------------------- */

/** A room code failed value-object validation. */
export class InvalidRoomCodeError extends ValidationError {
  readonly code = 'ROOM_CODE_INVALID';

  constructor(message = 'Room code is invalid.') {
    super(message);
  }
}

/** A reconnect token failed value-object validation. */
export class InvalidReconnectTokenError extends ValidationError {
  readonly code = 'RECONNECT_TOKEN_INVALID';

  constructor(message = 'Reconnect token is invalid.') {
    super(message);
  }
}

/** A player name failed value-object validation. */
export class InvalidPlayerNameError extends ValidationError {
  readonly code = 'PLAYER_NAME_INVALID';

  constructor(message = 'Player name is invalid.') {
    super(message);
  }
}

/** A team name failed value-object validation. */
export class InvalidTeamNameError extends ValidationError {
  readonly code = 'TEAM_NAME_INVALID';

  constructor(message = 'Team name is invalid.') {
    super(message);
  }
}

/** A score failed value-object validation (non-integer or negative). */
export class InvalidScoreError extends ValidationError {
  readonly code = 'SCORE_INVALID';

  constructor(message = 'Score is invalid.') {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Not-found category (→ HTTP 404).                                           */
/* -------------------------------------------------------------------------- */

/** A room could not be found. */
export class RoomNotFoundError extends NotFoundError {
  readonly code = 'ROOM_NOT_FOUND';

  constructor(message = 'Room not found.') {
    super(message);
  }
}

/** A player could not be found. */
export class PlayerNotFoundError extends NotFoundError {
  readonly code = 'PLAYER_NOT_FOUND';

  constructor(message = 'Player not found.') {
    super(message);
  }
}

/** A team could not be found. */
export class TeamNotFoundError extends NotFoundError {
  readonly code = 'TEAM_NOT_FOUND';

  constructor(message = 'Team not found.') {
    super(message);
  }
}

/** A presentation topic could not be found. */
export class TopicNotFoundError extends NotFoundError {
  readonly code = 'TOPIC_NOT_FOUND';

  constructor(message = 'Topic not found.') {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Forbidden category (→ HTTP 403).                                           */
/* -------------------------------------------------------------------------- */

/** The acting player is not the captain of the target team. */
export class NotTeamCaptainError extends ForbiddenError {
  readonly code = 'NOT_TEAM_CAPTAIN';

  constructor(message = 'Only the team captain may perform this action.') {
    super(message);
  }
}

/** The caller did not present a valid host token for this room. */
export class NotRoomHostError extends ForbiddenError {
  readonly code = 'NOT_ROOM_HOST';

  constructor(message = 'Only the room host may perform this action.') {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Domain-rule category (→ HTTP 409).                                         */
/* -------------------------------------------------------------------------- */

/** Attempted to assign a captain to a team that already has one. */
export class CaptainAlreadyAssignedError extends DomainRuleError {
  readonly code = 'CAPTAIN_ALREADY_ASSIGNED';

  constructor(message = 'A captain is already assigned to this team.') {
    super(message);
  }
}

/** Attempted a stage transition that is not legal from the current stage. */
export class InvalidStageTransitionError extends DomainRuleError {
  readonly code = 'INVALID_STAGE_TRANSITION';

  constructor(from?: string, to?: string) {
    super(
      from && to
        ? `Illegal stage transition: ${from} → ${to}.`
        : 'Illegal stage transition.',
    );
  }
}

/** A room was constructed with `blockedQuestionsCount > totalQuestionsCount`. */
export class InvalidQuestionCountsError extends DomainRuleError {
  readonly code = 'QUESTION_COUNTS_INVALID';

  constructor(
    message = 'blockedQuestionsCount cannot exceed totalQuestionsCount.',
  ) {
    super(message);
  }
}

/** A player with the same name already exists in the room. */
export class PlayerNameTakenError extends DomainRuleError {
  readonly code = 'PLAYER_NAME_TAKEN';

  constructor(message = 'A player with this name already exists in the room.') {
    super(message);
  }
}

/** The chosen topic is already selected by another team in the room. */
export class TopicAlreadyTakenError extends DomainRuleError {
  readonly code = 'TOPIC_ALREADY_TAKEN';

  constructor(message = 'This topic is already taken in the room.') {
    super(message);
  }
}

/** The room has reached its maximum number of teams. */
export class TeamLimitReachedError extends DomainRuleError {
  readonly code = 'TEAM_LIMIT_REACHED';

  constructor(message = 'The room has reached its team limit.') {
    super(message);
  }
}

/** The team has reached its maximum number of players. */
export class TeamFullError extends DomainRuleError {
  readonly code = 'TEAM_FULL';

  constructor(message = 'The team is full.') {
    super(message);
  }
}

/** Not enough ready teams to start the game. */
export class NotEnoughReadyTeamsError extends DomainRuleError {
  readonly code = 'NOT_ENOUGH_READY_TEAMS';

  constructor(message = 'Not enough ready teams to start the game.') {
    super(message);
  }
}

/** The player already belongs to a team and cannot join another. */
export class AlreadyOnTeamError extends DomainRuleError {
  readonly code = 'ALREADY_ON_TEAM';

  constructor(message = 'The player is already on a team.') {
    super(message);
  }
}

/** A mutation was attempted on a room that is not ACTIVE (closed/finished). */
export class RoomNotActiveError extends DomainRuleError {
  readonly code = 'ROOM_NOT_ACTIVE';

  constructor(message = 'The room is not active.') {
    super(message);
  }
}

/** No free topics remain to auto-assign at game start. */
export class NoFreeTopicsError extends DomainRuleError {
  readonly code = 'NO_FREE_TOPICS';

  constructor(message = 'No free topics remain to assign.') {
    super(message);
  }
}

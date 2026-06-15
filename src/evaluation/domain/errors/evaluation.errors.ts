import {
  DomainRuleError,
  ForbiddenError,
  NotFoundError,
} from '../../../core/errors/app.error';

/**
 * Evaluation domain error catalog (plan §12, §14.10). Each error extends the
 * semantic base that fixes its HTTP category ({@link NotFoundError} → 404,
 * {@link ForbiddenError} → 403, {@link DomainRuleError} → 409) and narrows
 * `code` to its own stable, machine-readable identifier. The
 * {@link AllExceptionsFilter} maps by base class, so adding an error here needs
 * no filter change.
 */

/* -------------------------------------------------------------------------- */
/* Forbidden category (→ HTTP 403).                                           */
/* -------------------------------------------------------------------------- */

/**
 * A team tried to evaluate ITSELF (§14.10 — a captain scores the OTHER teams,
 * never their own). The load-bearing guard is {@link SubmitEvaluationUseCase},
 * which rejects this BEFORE any persistence; the {@link EvaluationScore.create}
 * backstop ({@link InvalidEvaluatorError}) is the second rampart (there is no DB
 * constraint against self-evaluation).
 */
export class SelfEvaluationError extends ForbiddenError {
  readonly code = 'SELF_EVALUATION';

  constructor(message = 'A team cannot evaluate itself.') {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Not-found category (→ HTTP 404).                                           */
/* -------------------------------------------------------------------------- */

/**
 * The team being evaluated does not exist, or belongs to another room (§15.11).
 * Thrown by {@link SubmitEvaluationUseCase} when `targetTeamId` resolves to no
 * row, or to a team whose `roomId` is not this room (cross-tenant guard).
 */
export class TargetTeamNotFoundError extends NotFoundError {
  readonly code = 'TARGET_TEAM_NOT_FOUND';

  constructor(message = 'Target team not found.') {
    super(message);
  }
}

/**
 * No evaluation score exists for the named (target, evaluator) pair (§15.11).
 * Thrown by the per-target {@link ConfirmEvaluationUseCase} branch when there is
 * no draft row to confirm.
 */
export class EvaluationNotFoundError extends NotFoundError {
  readonly code = 'EVALUATION_NOT_FOUND';

  constructor(message = 'Evaluation score not found.') {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Domain-rule category (→ HTTP 409).                                         */
/* -------------------------------------------------------------------------- */

/**
 * A score already exists for this (room, target, evaluator) and is CONFIRMED
 * (§14.10 — confirmation is immutable). Thrown by {@link SubmitEvaluationUseCase}
 * when an evaluator tries to overwrite their own confirmed score, and by
 * {@link ConfirmEvaluationUseCase} when a per-target confirm names an
 * already-confirmed row.
 */
export class EvaluationAlreadyConfirmedError extends DomainRuleError {
  readonly code = 'EVALUATION_ALREADY_CONFIRMED';

  constructor(message = 'This evaluation has already been confirmed.') {
    super(message);
  }
}

/**
 * Two submissions raced for the same (room, target, evaluator) and the loser hit
 * a unique index (`evaluation_scores_room_target_evaluator_uq` or the partial
 * `evaluation_scores_host_per_target_uq`). DEFENSIVE: the use case resolves
 * create-vs-update under the per-room advisory lock, so a concurrent insert is
 * unreachable in practice — but the adapter still translates the 23505 so the
 * loser surfaces a clean 409 rather than a 500.
 */
export class EvaluationAlreadySubmittedError extends DomainRuleError {
  readonly code = 'EVALUATION_ALREADY_SUBMITTED';

  constructor(message = 'An evaluation already exists for this evaluator.') {
    super(message);
  }
}

/**
 * A criterion score fell outside its seeded `[minScore, maxScore]` range
 * (§14.10 — MVP criteria are 0–10). Thrown by {@link SubmitEvaluationUseCase}
 * after reading the bounds from the criteria catalog (by `order`, not title).
 */
export class ScoreOutOfRangeError extends DomainRuleError {
  readonly code = 'SCORE_OUT_OF_RANGE';

  constructor(message = 'A criterion score is out of its allowed range.') {
    super(message);
  }
}

/**
 * An evaluation score was constructed with a malformed evaluator: a TEAM score
 * must carry an `evaluatorTeamId` (and no `hostId`), a HOST score a `hostId`
 * (and no `evaluatorTeamId`), and a TEAM may never target ITSELF. The entity
 * backstop ({@link EvaluationScore.create}); the use case rejects the same
 * shapes earlier with the more specific {@link SelfEvaluationError} (403) /
 * {@link NotTeamCaptainError} (403).
 */
export class InvalidEvaluatorError extends DomainRuleError {
  readonly code = 'INVALID_EVALUATOR';

  constructor(message = 'The evaluator is invalid for this score.') {
    super(message);
  }
}

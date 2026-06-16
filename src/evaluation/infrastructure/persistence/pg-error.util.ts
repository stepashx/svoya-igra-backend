import { Logger } from '@nestjs/common';
import { asUniqueViolation } from '../../../infrastructure/database/pg-error.util';
import {
  EvaluationAlreadySubmittedError,
  ResultsAlreadyCalculatedError,
} from '../../domain/errors';

/** One score per (room, target, evaluator-team) — the TEAM-score uniqueness. */
export const EVALUATION_SCORE_TEAM_UNIQUE_CONSTRAINT =
  'evaluation_scores_room_target_evaluator_uq';

/** One HOST score per (room, target) — the partial `WHERE evaluator_type='HOST'` index. */
export const EVALUATION_SCORE_HOST_UNIQUE_CONSTRAINT =
  'evaluation_scores_host_per_target_uq';

/** One final result per (room, team) — the §14.10 write-once uniqueness. */
export const EVALUATION_FINAL_RESULT_UNIQUE_CONSTRAINT =
  'final_results_room_id_team_id_uq';

const logger = new Logger('EvaluationPgError');

/**
 * Translate a Postgres 23505 unique violation on either evaluation-score index
 * into {@link EvaluationAlreadySubmittedError}, then re-throw. The generic 23505
 * narrowing (cause-walk) is the shared {@link asUniqueViolation}. Anything that
 * is not a recognised unique violation is re-thrown unchanged so it surfaces as
 * a 500.
 *
 * This path is DEFENSIVE, not the arbiter: the submit use case resolves
 * create-vs-update under the per-room advisory lock, so a 23505 here means the
 * lock was somehow bypassed — it is logged at WARN as a signal, not treated as
 * normal flow. Always throws; declared `never` so a `catch` that calls it
 * type-checks as exhaustive.
 */
export function translateEvaluationUniqueViolation(error: unknown): never {
  const violation = asUniqueViolation(error);
  if (
    violation?.constraint === EVALUATION_SCORE_TEAM_UNIQUE_CONSTRAINT ||
    violation?.constraint === EVALUATION_SCORE_HOST_UNIQUE_CONSTRAINT
  ) {
    logger.warn(
      `Defensive 23505 on ${violation.constraint} — the per-room lock was bypassed.`,
    );
    throw new EvaluationAlreadySubmittedError();
  }
  throw error;
}

/**
 * Translate a Postgres 23505 on the `final_results_room_id_team_id_uq` index into
 * {@link ResultsAlreadyCalculatedError}, then re-throw. The primary idempotency
 * guard is the stage gate (a second CalculateResults finds the room past
 * EVALUATION → 409 UnexpectedGameStage); this is the DEFENSIVE backstop for a
 * racing duplicate insert, logged at WARN since the per-room lock should make it
 * unreachable. Anything else re-throws unchanged (→ 500). Always throws;
 * declared `never` so a `catch` that calls it type-checks as exhaustive.
 */
export function translateFinalResultUniqueViolation(error: unknown): never {
  const violation = asUniqueViolation(error);
  if (violation?.constraint === EVALUATION_FINAL_RESULT_UNIQUE_CONSTRAINT) {
    logger.warn(
      `Defensive 23505 on ${violation.constraint} — the per-room lock was bypassed.`,
    );
    throw new ResultsAlreadyCalculatedError();
  }
  throw error;
}

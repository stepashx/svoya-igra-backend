import { asUniqueViolation } from '../../../infrastructure/database/pg-error.util';
import { PresentationSubmissionConflictError } from '../../domain/errors';

/** Unique index enforcing "one submission per team per room" (§15.10). */
export const PRESENTATION_SUBMISSION_UNIQUE_CONSTRAINT =
  'presentation_submissions_room_id_team_id_uq';

/**
 * Translate a Postgres 23505 unique violation into a presentation domain error
 * by its constraint name, then re-throw. The generic 23505 narrowing
 * (cause-walk) is the shared {@link asUniqueViolation}; this delegates to it,
 * exactly as the commerce `translateUniqueViolation` does. Anything that is not
 * the recognised unique violation is re-thrown unchanged so it surfaces as a
 * 500.
 *
 * Always throws; declared `never` so a `catch` block that calls it type-checks
 * as exhaustive.
 */
export function translatePresentationUniqueViolation(error: unknown): never {
  const violation = asUniqueViolation(error);
  if (violation?.constraint === PRESENTATION_SUBMISSION_UNIQUE_CONSTRAINT) {
    throw new PresentationSubmissionConflictError();
  }
  throw error;
}

import { DomainRuleError } from '../../../core/errors/app.error';

/**
 * Presentation persistence domain errors. The presentation feature owns the
 * submission facts, so the unique-constraint translation that the upload use
 * case relies on lives here (mirroring the commerce
 * {@link ItemAlreadyPurchasedError}). Extends the semantic
 * {@link DomainRuleError} base from core (→ HTTP 409 via
 * {@link AllExceptionsFilter}).
 */

/**
 * Two uploads raced for the same (room, team) and the loser hit the
 * `presentation_submissions_room_id_team_id_uq` unique index. Defensive: the
 * upload use case resolves create-vs-replace under the per-room advisory lock,
 * so a concurrent insert is unreachable in practice — but the adapter still
 * translates the 23505 so the loser surfaces a clean 409 rather than a 500.
 */
export class PresentationSubmissionConflictError extends DomainRuleError {
  readonly code = 'PRESENTATION_SUBMISSION_CONFLICT';

  constructor(
    message = 'A presentation submission already exists for this team.',
  ) {
    super(message);
  }
}

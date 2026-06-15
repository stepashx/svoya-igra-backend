import {
  DomainRuleError,
  ValidationError,
} from '../../../core/errors/app.error';

/**
 * Presentation-stage domain errors raised by the game-session upload use case
 * (sub-stage 9.3). They live here — beside {@link lobby.errors} — because Game
 * Flow owns the PRESENTATION_PREPARATION stage and the upload REST surface
 * (Design A), exactly as the shop errors do for SHOP. Each extends the semantic
 * base that fixes its HTTP category ({@link ValidationError} → 400,
 * {@link DomainRuleError} → 409); the {@link AllExceptionsFilter} maps by base
 * class, so adding one here needs no filter change.
 *
 * There is deliberately NO 415 base in the catalog: an unsupported upload
 * format surfaces as a 400 ValidationError (the recon B3 decision), and the
 * normal rejection path is the Multer `fileFilter` (BadRequestException → 400)
 * — {@link UnsupportedPresentationFormatError} is the defensive in-use-case
 * re-check that ALSO guards the storage key against a path-injected extension.
 */

/* -------------------------------------------------------------------------- */
/* Validation category (→ HTTP 400).                                          */
/* -------------------------------------------------------------------------- */

/**
 * The uploaded file's extension is not one of the configured presentation
 * formats (`ALLOWED_PRESENTATION_FORMATS`). Raised defensively inside the
 * upload use case AFTER the Multer `fileFilter` has already rejected the common
 * case — the use case re-derives the extension from the original name and
 * re-validates it against the allowlist before it ever reaches the storage key.
 */
export class UnsupportedPresentationFormatError extends ValidationError {
  readonly code = 'UNSUPPORTED_PRESENTATION_FORMAT';

  constructor(message = 'The presentation file format is not supported.') {
    super(message);
  }
}

/* -------------------------------------------------------------------------- */
/* Domain-rule category (→ HTTP 409).                                         */
/* -------------------------------------------------------------------------- */

/**
 * A captain tried to upload before the host opened presentation preparation:
 * the {@link PresentationTimerRegistry} is IDLE (no deadline). Uploading
 * requires a running preparation window — RUNNING is on-time, EXPIRED is
 * late-with-penalty, but IDLE has no deadline to score against, so it is
 * rejected (the D4a decision). A process restart drops the in-memory timer, so
 * uploads 409 until the host re-opens preparation.
 */
export class PreparationNotStartedError extends DomainRuleError {
  readonly code = 'PREPARATION_NOT_STARTED';

  constructor(
    message = 'Presentation preparation has not been started by the host.',
  ) {
    super(message);
  }
}

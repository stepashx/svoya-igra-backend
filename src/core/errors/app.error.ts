/**
 * Base error type shared across layers. Framework-agnostic: the domain and
 * application layers throw these without knowing about HTTP or transport.
 * The presentation layer maps `code` to a concrete transport status.
 */
export abstract class AppError extends Error {
  /** Stable, machine-readable identifier (e.g. ROOM_NOT_FOUND). */
  abstract readonly code: string;

  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** A required entity could not be found. */
export class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND';
}

/** A request violated a business rule or invariant. */
export class DomainRuleError extends AppError {
  readonly code = 'DOMAIN_RULE_VIOLATION';
}

/** Input failed validation before reaching domain logic. */
export class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR';
}

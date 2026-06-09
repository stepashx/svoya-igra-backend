/**
 * Base error type shared across layers. Framework-agnostic: the domain and
 * application layers throw these without knowing about HTTP or transport. The
 * presentation layer maps an error to a concrete transport status by its
 * position in this hierarchy — see {@link AllExceptionsFilter}.
 */
export abstract class AppError extends Error {
  /**
   * Stable, machine-readable identifier (e.g. ROOM_NOT_FOUND). Declared as a
   * plain `string` (not a string literal) so feature catalogs can extend a
   * semantic base and narrow `code` to their own concrete value.
   */
  abstract readonly code: string;

  protected constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = new.target.name;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/** A required entity could not be found. Maps to HTTP 404. */
export class NotFoundError extends AppError {
  readonly code: string = 'NOT_FOUND';

  constructor(message = 'Resource not found.', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** A request violated a business rule or invariant. Maps to HTTP 409. */
export class DomainRuleError extends AppError {
  readonly code: string = 'DOMAIN_RULE_VIOLATION';

  constructor(
    message = 'The request violates a domain rule.',
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/** Input failed validation before reaching domain logic. Maps to HTTP 400. */
export class ValidationError extends AppError {
  readonly code: string = 'VALIDATION_ERROR';

  constructor(message = 'Validation failed.', options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** The caller is authenticated but not permitted to act. Maps to HTTP 403. */
export class ForbiddenError extends AppError {
  readonly code: string = 'FORBIDDEN';

  constructor(
    message = 'This action is forbidden.',
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

/**
 * Infrastructure-neutral PostgreSQL error narrowing, shared by the feature
 * persistence adapters. No domain imports — each feature keeps its own
 * constraint → domain-error translation on top of {@link asUniqueViolation}
 * (see the game-session and commerce `pg-error.util.ts`).
 */

/** PostgreSQL SQLSTATE for a unique-constraint violation. */
export const UNIQUE_VIOLATION = '23505';

export interface PgUniqueViolation {
  constraint?: string;
}

/**
 * Narrow an unknown thrown value to a Postgres 23505 (with its constraint).
 * Drizzle wraps the driver error (e.g. `DrizzleQueryError`) and keeps the pg
 * `DatabaseError` — which actually carries `code`/`constraint` — on `.cause`,
 * so we walk the cause chain rather than only inspecting the top-level error.
 */
export function asUniqueViolation(error: unknown): PgUniqueViolation | null {
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (
      typeof current === 'object' &&
      (current as { code?: unknown }).code === UNIQUE_VIOLATION
    ) {
      return { constraint: (current as { constraint?: string }).constraint };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

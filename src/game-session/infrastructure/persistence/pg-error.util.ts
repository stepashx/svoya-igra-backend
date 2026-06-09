import {
  CaptainAlreadyAssignedError,
  PlayerNameTakenError,
  TopicAlreadyTakenError,
} from '../../domain/errors';

/** PostgreSQL SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = '23505';

/** Unique index whose violation means "retry CreateRoom with a fresh code". */
export const ROOM_CODE_UNIQUE_CONSTRAINT = 'rooms_code_uq';

interface PgUniqueViolation {
  constraint?: string;
}

/**
 * Narrow an unknown thrown value to a Postgres 23505 (with its constraint).
 * Drizzle wraps the driver error (e.g. `DrizzleQueryError`) and keeps the pg
 * `DatabaseError` — which actually carries `code`/`constraint` — on `.cause`,
 * so we walk the cause chain rather than only inspecting the top-level error.
 */
function asUniqueViolation(error: unknown): PgUniqueViolation | null {
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

/**
 * Translate a Postgres 23505 unique violation into a lobby domain error by its
 * constraint name, then re-throw. Anything that is not a recognised unique
 * violation — including `rooms_code_uq` (the CreateRoom retry signal, detected
 * separately via {@link isRoomCodeUniqueViolation}) and any unknown constraint —
 * is re-thrown unchanged so callers can react or let it surface as a 500.
 *
 * Always throws; declared `never` so a `catch` block that calls it type-checks
 * as exhaustive.
 */
export function translateUniqueViolation(error: unknown): never {
  const violation = asUniqueViolation(error);
  switch (violation?.constraint) {
    case 'players_room_id_name_uq':
      throw new PlayerNameTakenError();
    case 'teams_room_id_selected_topic_id_uq':
      throw new TopicAlreadyTakenError();
    case 'players_captain_per_team_uq':
      throw new CaptainAlreadyAssignedError();
    default:
      throw error;
  }
}

/** True when `error` is the `rooms_code_uq` violation (CreateRoom retry signal). */
export function isRoomCodeUniqueViolation(error: unknown): boolean {
  return asUniqueViolation(error)?.constraint === ROOM_CODE_UNIQUE_CONSTRAINT;
}

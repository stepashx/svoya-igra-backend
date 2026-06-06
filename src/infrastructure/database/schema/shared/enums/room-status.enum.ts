/**
 * Lifecycle of a game room.
 *
 * Modelled as a constrained text column (not a native PostgreSQL enum) so the
 * set of values can evolve through ordinary migrations without `ALTER TYPE`.
 * `ROOM_STATUSES` is the single source of truth: future schema files pass it to
 * `text('status', { enum: ROOM_STATUSES })`, and application code uses the
 * derived `RoomStatus` union. Defined once here; never re-declared per feature.
 *
 * - `lobby`        — created, players join and mark ready (Stage 5B).
 * - `in_progress`  — the session is running (gameplay through evaluation).
 * - `finished`     — the session has ended; results are final.
 */
export const ROOM_STATUSES = ['lobby', 'in_progress', 'finished'] as const;

export type RoomStatus = (typeof ROOM_STATUSES)[number];

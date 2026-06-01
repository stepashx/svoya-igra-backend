/**
 * Realtime connection state of a player within a room. Drives reconnect
 * handling and presence display in the Game Session feature (Stage 5B).
 *
 * Constrained text column + derived union (see {@link RoomStatus}).
 *
 * - `connected`    — an active socket is bound to the player.
 * - `disconnected` — no active socket; the seat is preserved for reconnect.
 */
export const PLAYER_CONNECTION_STATUSES = [
  'connected',
  'disconnected',
] as const;

export type PlayerConnectionStatus =
  (typeof PLAYER_CONNECTION_STATUSES)[number];

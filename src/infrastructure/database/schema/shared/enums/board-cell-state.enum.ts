/**
 * State of a single cell on the question board (Jeopardy-style grid). A cell is
 * picked once and then consumed, so the state machine is one-directional:
 * `available` → `selected` → `opened` → `blocked`.
 *
 * Constrained text column + derived union (see {@link RoomStatus}). Owned by the
 * Gameplay feature.
 *
 * - `available` — not yet chosen; selectable.
 * - `selected`  — chosen by the active team; awaiting host confirmation.
 * - `opened`    — question revealed and currently being answered (locked).
 * - `blocked`   — any answered/resolved cell; no longer selectable.
 */
export const BOARD_CELL_STATES = [
  'available',
  'selected',
  'opened',
  'blocked',
] as const;

export type BoardCellState = (typeof BOARD_CELL_STATES)[number];

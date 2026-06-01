/**
 * State of a single cell on the question board (Jeopardy-style grid). A cell is
 * picked once and then consumed, so the state machine is one-directional:
 * `available` → `active` → `answered`.
 *
 * Constrained text column + derived union (see {@link RoomStatus}). Owned by the
 * Gameplay feature.
 *
 * - `available` — not yet chosen; selectable.
 * - `active`    — chosen and currently being answered (locked).
 * - `answered`  — resolved; no longer selectable.
 */
export const BOARD_CELL_STATES = ['available', 'active', 'answered'] as const;

export type BoardCellState = (typeof BOARD_CELL_STATES)[number];

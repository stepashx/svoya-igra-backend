/**
 * The phase a running session is in. Stages advance in order and mirror the
 * feature areas of the codebase (gameplay → commerce → presentation →
 * evaluation), which keeps stage gating and feature ownership aligned.
 *
 * Constrained text column + derived union (see {@link RoomStatus}). The exact
 * progression rules live with the Game Session feature (Stage 5B); this enum
 * only names the legal stages.
 *
 * - `lobby`        — pre-game setup: join, teams, topic selection, ready.
 * - `gameplay`     — teams answer board questions to earn currency.
 * - `commerce`     — teams spend earnings in the shop / on QR tools.
 * - `presentation` — teams assemble and upload their presentation.
 * - `evaluation`   — submissions are judged.
 * - `finished`     — results are final.
 */
export const GAME_STAGES = [
  'lobby',
  'gameplay',
  'commerce',
  'presentation',
  'evaluation',
  'finished',
] as const;

export type GameStage = (typeof GAME_STAGES)[number];

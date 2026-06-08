/**
 * String-union enums shared across the schema.
 *
 * Stored as `text('col', { enum: [...] })` columns — no `pgEnum`, no DB CHECK.
 * The union is enforced at the TypeScript boundary; the column stays a plain
 * `text` in PostgreSQL. Each array is the single source of truth: domain code
 * and tests derive the union type and the allowed values from these constants.
 *
 * `storageProvider` is intentionally NOT modelled here — it is a plain text
 * column defaulting to `'minio'`, set in code/seeds (see the file-bearing
 * tables), not a closed enum.
 */

/** Room lifecycle stage (`Room.currentStage`) — plan §13. */
export const GAME_STAGES = [
  'LOBBY',
  'TEAM_SETUP',
  'READY_CHECK',
  'GAME_BOARD',
  'QUESTION_OPENED',
  'ANSWER_REVIEW',
  'SHOP',
  'PRESENTATION_PREPARATION',
  'PRESENTATION_DEFENSE',
  'EVALUATION',
  'RESULTS',
  'FINISHED',
] as const;
export type GameStage = (typeof GAME_STAGES)[number];

/** Board cell state (`BoardCell.state`) — plan §12. */
export const BOARD_CELL_STATES = [
  'AVAILABLE',
  'SELECTED',
  'OPENED',
  'BLOCKED',
] as const;
export type BoardCellState = (typeof BOARD_CELL_STATES)[number];

/** Who produced an evaluation score (`EvaluationScore.evaluatorType`). */
export const EVALUATOR_TYPES = ['TEAM', 'HOST'] as const;
export type EvaluatorType = (typeof EVALUATOR_TYPES)[number];

/** Stored QR-tool file format (`QrTool.fileFormat`) — SVG only in MVP. */
export const QR_FILE_FORMATS = ['SVG'] as const;
export type QrFileFormat = (typeof QR_FILE_FORMATS)[number];

/** Room availability status (`Room.status`), tracked separately from the stage. */
export const ROOM_STATUSES = ['ACTIVE', 'FINISHED', 'CLOSED'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

/** Player connection status (`Player.connectionStatus`). */
export const CONNECTION_STATUSES = ['CONNECTED', 'DISCONNECTED'] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

/**
 * Presentation submission status (`PresentationSubmission.status`).
 * Create-on-upload model: a row exists only after an upload, so the status is
 * `UPLOADED` (before the deadline) or `LATE` (after it).
 */
export const SUBMISSION_STATUSES = ['UPLOADED', 'LATE'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

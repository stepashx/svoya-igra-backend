/**
 * Shared enum/status vocabulary for the data layer. Each concept is defined
 * exactly once as a value tuple (for `text(..., { enum })` columns) plus a
 * derived string-union type, so feature-area schemas never duplicate a status
 * set. Native PostgreSQL enums are intentionally avoided — see the individual
 * files for the rationale.
 */
export * from './room-status.enum';
export * from './game-stage.enum';
export * from './player-connection-status.enum';
export * from './board-cell-state.enum';
export * from './file-format.enum';
export * from './presentation-submission-status.enum';
export * from './evaluator-type.enum';

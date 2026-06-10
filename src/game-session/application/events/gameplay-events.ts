/**
 * Canonical server → client gameplay (§16.4) broadcast names, emitted by the
 * game-session battle use cases (Design A: Game Flow owns the stages/turn and
 * therefore the battle cycle) through {@link RealtimeEventsPort.emitToRoom}.
 * They live here — next to the use cases that emit them — so the application
 * layer stays free of any transport import, exactly as {@link GameSessionEvent}.
 *
 * Sub-stage 6.2a deliberately emits only this subset of the §16.4 catalog:
 * - `cell-selected` is SUPERSEDED by `cell-selection-requested` and never sent.
 * - `score-changed` is reserved for Stage 7 (scoring) and never sent in Stage 6.
 * - `question-correct-answer-shown-to-host` is 6.2b (host-socket delivery); in
 *   6.2a the correct answer reaches the host only over REST.
 * - `game-turn-changed` keeps its game-session name ({@link GameSessionEvent}) —
 *   it is shared by §16.3/§16.4 and not duplicated here.
 *
 * Audience: all rows below are room-wide in 6.2a (`cell-selection-requested`
 * narrows to host-only in 6.2b).
 */
export const GameplayEvent = {
  BoardStateUpdated: 'server:gameplay:board-state-updated',
  CellSelectionRequested: 'server:gameplay:cell-selection-requested',
  CellSelectionApproved: 'server:gameplay:cell-selection-approved',
  CellSelectionRejected: 'server:gameplay:cell-selection-rejected',
  QuestionOpened: 'server:gameplay:question-opened',
  QuestionTimerStarted: 'server:gameplay:question-timer-started',
  QuestionTimerEnded: 'server:gameplay:question-timer-ended',
  AnswerSubmitted: 'server:gameplay:answer-submitted',
  AnswerAccepted: 'server:gameplay:answer-accepted',
  AnswerRejected: 'server:gameplay:answer-rejected',
  CellBlocked: 'server:gameplay:cell-blocked',
} as const;

export type GameplayEvent = (typeof GameplayEvent)[keyof typeof GameplayEvent];

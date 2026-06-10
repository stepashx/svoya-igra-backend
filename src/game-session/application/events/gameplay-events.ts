/**
 * Canonical server → client gameplay (§16.4) broadcast names, emitted by the
 * game-session battle use cases (Design A: Game Flow owns the stages/turn and
 * therefore the battle cycle) through {@link RealtimeEventsPort.emitToRoom} or,
 * for the host audience, {@link HostRealtimeEventsPort.emitToHost}. They live
 * here — next to the use cases that emit them — so the application layer stays
 * free of any transport import, exactly as {@link GameSessionEvent}.
 *
 * Stage 6 deliberately emits only this subset of the §16.4 catalog:
 * - `cell-selected` is SUPERSEDED by `cell-selection-requested` and never sent.
 * - `score-changed` is reserved for Stage 7 (scoring) and never sent in Stage 6.
 * - `game-turn-changed` keeps its game-session name ({@link GameSessionEvent}) —
 *   it is shared by §16.3/§16.4 and not duplicated here.
 *
 * Audience: room-wide, except the two host-only rows (6.2b) —
 * `cell-selection-requested` and `question-correct-answer-shown-to-host` go to
 * the host's live sockets only; the correct answer never enters a room-wide
 * payload (§16.4 secrecy).
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
  QuestionCorrectAnswerShownToHost:
    'server:gameplay:question-correct-answer-shown-to-host',
  CellBlocked: 'server:gameplay:cell-blocked',
} as const;

export type GameplayEvent = (typeof GameplayEvent)[keyof typeof GameplayEvent];

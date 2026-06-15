/**
 * Canonical server → client evaluation (§16.8) broadcast names, emitted by the
 * game-session use cases (Design A: Game Flow owns the EVALUATION stage) through
 * {@link RealtimeEventsPort.emitToRoom}. They live here — next to the use cases
 * that emit them — so the application layer stays free of any transport import,
 * exactly as {@link CommerceEvent} / {@link DefenseEvent}; the evaluation module
 * itself emits nothing.
 *
 * Sub-stage 10.2 emits ALL three:
 * - `score-submitted` — a captain/host submitted (or re-submitted) one score
 *   (SubmitEvaluationUseCase), FIRST of the submit pair.
 * - `score-confirmed` — a captain/host froze a score (ConfirmEvaluationUseCase),
 *   FIRST of the confirm pair.
 * - `progress-updated` — the running tally changed (after either action).
 *
 * Audience: all three are ROOM-WIDE. Secrecy (§16.8 "intrigue"): NONE of the
 * payloads carry a numeric score — only ids, counts and flags. The author's own
 * numbers come back exclusively in their REST reply, never in a broadcast, and
 * there is no GET surface for another evaluator's scores until results (10.3).
 *
 * Reserved for 10.3 (NOT defined here): `server:evaluation:completed` and the
 * `server:evaluation:results-*` family (aggregation/places). There is also no
 * `started` event — the room auto-enters EVALUATION when the last defense
 * finishes (10.1 `defense:finished`), so no StartEvaluation, no `started`.
 */
export const EvaluationEvent = {
  ScoreSubmitted: 'server:evaluation:score-submitted',
  ScoreConfirmed: 'server:evaluation:score-confirmed',
  ProgressUpdated: 'server:evaluation:progress-updated',
} as const;

export type EvaluationEvent =
  (typeof EvaluationEvent)[keyof typeof EvaluationEvent];

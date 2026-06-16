/**
 * Canonical server → client evaluation (§16.8) broadcast names, emitted by the
 * game-session use cases (Design A: Game Flow owns the EVALUATION stage) through
 * {@link RealtimeEventsPort.emitToRoom}. They live here — next to the use cases
 * that emit them — so the application layer stays free of any transport import,
 * exactly as {@link CommerceEvent} / {@link DefenseEvent}; the evaluation module
 * itself emits nothing.
 *
 * Sub-stage 10.2 emits the first three (collection):
 * - `score-submitted` — a captain/host submitted (or re-submitted) one score
 *   (SubmitEvaluationUseCase), FIRST of the submit pair.
 * - `score-confirmed` — a captain/host froze a score (ConfirmEvaluationUseCase),
 *   FIRST of the confirm pair.
 * - `progress-updated` — the running tally changed (after either action).
 *
 * Sub-stage 10.3 adds the final pair (results), emitted by CalculateResults
 * AFTER the transaction commits (the §14.10 finish is irreversible — there is no
 * corrective event, so the broadcast must not precede the durable write):
 * - `completed` — the game finished; carries `{ roomId, stage, status }`
 *   (stage RESULTS, status FINISHED).
 * - `results-calculated` — the final leaderboard; carries `{ roomId, leaderboard }`
 *   where each entry is a PUBLIC AGGREGATE (no individual evaluator scores).
 *
 * Audience: ALL are ROOM-WIDE. Secrecy (§16.8 "intrigue"): the COLLECTION
 * payloads carry no numeric score — only ids, counts and flags. The RESULTS
 * payloads do carry the computed aggregates (that secrecy lifts once the game is
 * over), but never the individual `evaluation_scores` (they stay private).
 *
 * Reserved (NOT defined here): `server:evaluation:results-shown` — a UI cue with
 * no server trigger.
 */
export const EvaluationEvent = {
  ScoreSubmitted: 'server:evaluation:score-submitted',
  ScoreConfirmed: 'server:evaluation:score-confirmed',
  ProgressUpdated: 'server:evaluation:progress-updated',
  Completed: 'server:evaluation:completed',
  ResultsCalculated: 'server:evaluation:results-calculated',
} as const;

export type EvaluationEvent =
  (typeof EvaluationEvent)[keyof typeof EvaluationEvent];

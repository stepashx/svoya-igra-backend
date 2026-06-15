/**
 * Canonical server → client defense (§16.7) broadcast names, emitted by the
 * game-session use cases (Design A: Game Flow owns the PRESENTATION_DEFENSE
 * stage) through {@link RealtimeEventsPort.emitToRoom}. They live here — next to
 * the use cases that emit them — so the application layer stays free of any
 * transport import, exactly as {@link CommerceEvent} / {@link PresentationEvent};
 * there is no separate defense module.
 *
 * Sub-stage 10.1 emits ALL five:
 * - `started` — StartDefenseUseCase opens the defenses (the room moves
 *   PRESENTATION_PREPARATION → PRESENTATION_DEFENSE); carries the full
 *   presentation `order`.
 * - `team-started` — the next presenter is on (StartDefense for the first team,
 *   Finish/Skip for each subsequent one); carries that team's id.
 * - `team-finished` / `team-skipped` — the current presenter finished or was
 *   skipped by the host (FinishPresentation / SkipPresenterUseCase).
 * - `finished` — the LAST presenter finished/skipped, the room moves
 *   PRESENTATION_DEFENSE → EVALUATION; carries `nextStage` (= EVALUATION).
 *
 * Audience: ALL five are ROOM-WIDE and PUBLIC — the defense order and progress
 * carry no secret (the opposite of the §16.5 QR secrecy), so 10.1 applies no
 * team-gating. See docs/realtime-events.md §16.7 for the matrix.
 */
export const DefenseEvent = {
  Started: 'server:defense:started',
  TeamStarted: 'server:defense:team-started',
  TeamFinished: 'server:defense:team-finished',
  TeamSkipped: 'server:defense:team-skipped',
  Finished: 'server:defense:finished',
} as const;

export type DefenseEvent = (typeof DefenseEvent)[keyof typeof DefenseEvent];

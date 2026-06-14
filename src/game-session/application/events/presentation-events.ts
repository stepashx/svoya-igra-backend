/**
 * Canonical server → client presentation (§16.6) broadcast names. They live
 * here — next to the game-session use cases that will emit them (Design A: Game
 * Flow owns the PRESENTATION_PREPARATION stage) — so the application layer stays
 * free of any transport import, exactly as {@link CommerceEvent}; the
 * presentation module itself emits nothing.
 *
 * Sub-stage 9.1 fixes the NAME / direction / area / audience contract ONLY — no
 * emission (mirroring 8.1 for commerce). The preparation/timer broadcasts
 * (`preparation-started`, `requirements-updated`, `timer-started`,
 * `timer-ended`) are wired in 9.2; the submission/files broadcasts
 * (`submission-uploaded`, `submission-replaced`, `submission-late`,
 * `submission-status-changed`, `files-updated`) in 9.3.
 *
 * Audience: ALL nine are ROOM-WIDE. Presentation files are PUBLIC (Этап2
 * §10.15) — the OPPOSITE of the §16.5 QR secrecy: a payload MAY carry a file's
 * `publicUrl` room-wide because there is nothing to hide, so 9.3 applies no
 * team-gating to these events. See docs/realtime-events.md §16.6 for the matrix.
 */
export const PresentationEvent = {
  PreparationStarted: 'server:presentation:preparation-started',
  RequirementsUpdated: 'server:presentation:requirements-updated',
  TimerStarted: 'server:presentation:timer-started',
  TimerEnded: 'server:presentation:timer-ended',
  SubmissionUploaded: 'server:presentation:submission-uploaded',
  SubmissionReplaced: 'server:presentation:submission-replaced',
  SubmissionLate: 'server:presentation:submission-late',
  SubmissionStatusChanged: 'server:presentation:submission-status-changed',
  FilesUpdated: 'server:presentation:files-updated',
} as const;

export type PresentationEvent =
  (typeof PresentationEvent)[keyof typeof PresentationEvent];

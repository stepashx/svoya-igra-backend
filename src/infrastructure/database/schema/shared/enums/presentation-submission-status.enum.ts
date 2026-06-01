/**
 * Lifecycle of a team's presentation submission. Tracks the upload from its
 * metadata placeholder through judging. Owned by the Presentation/Evaluation
 * features.
 *
 * Constrained text column + derived union (see {@link RoomStatus}).
 *
 * - `pending`   — submission row exists; no accepted upload yet.
 * - `submitted` — an upload has been accepted and is final.
 * - `evaluated` — judging is complete.
 */
export const PRESENTATION_SUBMISSION_STATUSES = [
  'pending',
  'submitted',
  'evaluated',
] as const;

export type PresentationSubmissionStatus =
  (typeof PRESENTATION_SUBMISSION_STATUSES)[number];

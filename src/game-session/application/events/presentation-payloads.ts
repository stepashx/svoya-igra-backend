import { PresentationSubmission } from '../../../presentation/domain/entities';

/**
 * Plain-object projections used as presentation (§16.6) event payloads, emitted
 * by {@link UploadPresentationUseCase}. As with the commerce
 * {@link shopCatalogSummary}, they carry no Swagger metadata and live in the
 * application layer where the emitting use case runs.
 *
 * UNLIKE the §16.5 commerce projections, these MAY carry the file's `publicUrl`:
 * presentation files are PUBLIC (Этап2 §10.15), so there is no secret to hide
 * and no team-gating — every payload is room-wide. Timestamps are rendered as
 * ISO strings (not raw `Date`s) so the WS `files-updated` push and the REST
 * `GET files` read hand the frontend the IDENTICAL shape; the GET-files DTO
 * mapper deliberately REUSES {@link presentationFileSummary} for that reason
 * (the one-projection / DRY contract for the file catalog).
 */

/** The single uploaded submission carried by `submission-uploaded`/`-replaced`. */
export interface PresentationUploadEventSummary {
  id: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  status: string;
  isLate: boolean;
  uploadedAt: string;
  publicUrl: string;
}

/**
 * Submission → the `submission` sub-object of `submission-uploaded` /
 * `submission-replaced` (the `roomId`/`teamId` sit at the event's top level).
 */
export function presentationUploadSummary(
  submission: PresentationSubmission,
): PresentationUploadEventSummary {
  return {
    id: submission.id,
    originalFileName: submission.originalFileName,
    mimeType: submission.mimeType,
    fileSize: submission.fileSize,
    status: submission.status,
    isLate: submission.isLate,
    uploadedAt: submission.uploadedAt.toISOString(),
    publicUrl: submission.publicUrl,
  };
}

/** One entry of the room file catalog carried by `files-updated` / `GET files`. */
export interface PresentationFileEventSummary {
  teamId: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  publicUrl: string;
  status: string;
  isLate: boolean;
  uploadedAt: string;
}

/**
 * Submission → one room-facing file-catalog entry. Shared by the `files-updated`
 * broadcast and the `GET files` DTO mapper (DRY) — both expose the same public
 * file metadata, so the client renders WS pushes and REST reads identically.
 */
export function presentationFileSummary(
  submission: PresentationSubmission,
): PresentationFileEventSummary {
  return {
    teamId: submission.teamId,
    originalFileName: submission.originalFileName,
    mimeType: submission.mimeType,
    fileSize: submission.fileSize,
    publicUrl: submission.publicUrl,
    status: submission.status,
    isLate: submission.isLate,
    uploadedAt: submission.uploadedAt.toISOString(),
  };
}

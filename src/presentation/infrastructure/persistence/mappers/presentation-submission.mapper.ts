import { presentationSubmissions } from '../../../../infrastructure/database/schema';
import { PresentationSubmission } from '../../../domain/entities';

type PresentationSubmissionRow = typeof presentationSubmissions.$inferSelect;
type PresentationSubmissionInsert = typeof presentationSubmissions.$inferInsert;

/** Row → entity. The schema `status` union is assigned to the domain union here. */
export function mapRowToPresentationSubmission(
  row: PresentationSubmissionRow,
): PresentationSubmission {
  return PresentationSubmission.reconstitute({
    id: row.id,
    roomId: row.roomId,
    teamId: row.teamId,
    uploadedByPlayerId: row.uploadedByPlayerId,
    originalFileName: row.originalFileName,
    mimeType: row.mimeType,
    fileSize: row.fileSize,
    storageProvider: row.storageProvider,
    bucket: row.bucket,
    storageKey: row.storageKey,
    publicUrl: row.publicUrl,
    uploadedAt: row.uploadedAt,
    deadlineAt: row.deadlineAt,
    isLate: row.isLate,
    latePenalty: row.latePenalty,
    status: row.status,
  });
}

/**
 * Entity → full insert payload. The domain STAMPS every derived column
 * (`uploadedAt`, `isLate`, the EFFECTIVE `latePenalty`, `status`,
 * `storageProvider`) — the DB defaults are never relied upon, so the persisted
 * row matches the create-time invariant exactly.
 */
export function mapPresentationSubmissionToInsert(
  submission: PresentationSubmission,
): PresentationSubmissionInsert {
  return {
    id: submission.id,
    roomId: submission.roomId,
    teamId: submission.teamId,
    uploadedByPlayerId: submission.uploadedByPlayerId,
    originalFileName: submission.originalFileName,
    mimeType: submission.mimeType,
    fileSize: submission.fileSize,
    storageProvider: submission.storageProvider,
    bucket: submission.bucket,
    storageKey: submission.storageKey,
    publicUrl: submission.publicUrl,
    uploadedAt: submission.uploadedAt,
    deadlineAt: submission.deadlineAt,
    isLate: submission.isLate,
    latePenalty: submission.latePenalty,
    status: submission.status,
  };
}

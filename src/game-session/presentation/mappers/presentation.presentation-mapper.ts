import {
  PresentationRequirement,
  PresentationSubmission,
} from '../../../presentation/domain/entities';
import { presentationFileSummary } from '../../application/events';
import { PresentationTimerState } from '../../application/timers';
import { UploadPresentationResult } from '../../application/use-cases';
import {
  PresentationDeadlineResponseDto,
  PresentationFileResponseDto,
  PresentationRequirementResponseDto,
  PresentationSubmissionStatusResponseDto,
  PresentationUploadResultResponseDto,
} from '../dto/response';

/** Requirement entity → response DTO. Public (room-wide): no secret content. */
export function toPresentationRequirementResponse(
  requirement: PresentationRequirement,
): PresentationRequirementResponseDto {
  return {
    id: requirement.id,
    title: requirement.title,
    description: requirement.description,
    order: requirement.order,
    isRequired: requirement.isRequired,
  };
}

/** Preparation timer state → deadline DTO (Date stamps rendered as ISO strings). */
export function toPresentationDeadlineResponse(
  timer: PresentationTimerState,
): PresentationDeadlineResponseDto {
  return {
    status: timer.status,
    startedAt: timer.startedAt ? timer.startedAt.toISOString() : null,
    endsAt: timer.endsAt ? timer.endsAt.toISOString() : null,
    remainingMs: timer.remainingMs,
  };
}

/** Submission fact → public status DTO (publicUrl is not a secret here, §10.15). */
export function toPresentationSubmissionStatusResponse(
  submission: PresentationSubmission,
): PresentationSubmissionStatusResponseDto {
  return {
    teamId: submission.teamId,
    status: submission.status,
    isLate: submission.isLate,
    uploadedAt: submission.uploadedAt.toISOString(),
    publicUrl: submission.publicUrl,
    originalFileName: submission.originalFileName,
    fileSize: submission.fileSize,
    latePenalty: submission.latePenalty,
  };
}

/**
 * Submission fact → public file DTO for `GET files`. Deliberately REUSES the
 * application-layer {@link presentationFileSummary} so the REST read and the
 * `files-updated` broadcast expose the IDENTICAL shape (DRY).
 */
export function toPresentationFileResponse(
  submission: PresentationSubmission,
): PresentationFileResponseDto {
  return presentationFileSummary(submission);
}

/** Upload use-case result → the captain's flat reply (publicUrl allowed, §10.15). */
export function toPresentationUploadResultResponse(
  result: UploadPresentationResult,
): PresentationUploadResultResponseDto {
  const { submission } = result;
  return {
    isCreate: result.isCreate,
    teamId: submission.teamId,
    originalFileName: submission.originalFileName,
    mimeType: submission.mimeType,
    fileSize: submission.fileSize,
    status: submission.status,
    isLate: submission.isLate,
    latePenalty: submission.latePenalty,
    uploadedAt: submission.uploadedAt.toISOString(),
    publicUrl: submission.publicUrl,
  };
}

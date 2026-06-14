import {
  PresentationRequirement,
  PresentationSubmission,
} from '../../../presentation/domain/entities';
import { PresentationTimerState } from '../../application/timers';
import {
  PresentationDeadlineResponseDto,
  PresentationRequirementResponseDto,
  PresentationSubmissionStatusResponseDto,
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
  };
}

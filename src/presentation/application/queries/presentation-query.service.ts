import { Inject, Injectable } from '@nestjs/common';
import {
  PresentationRequirement,
  PresentationSubmission,
} from '../../domain/entities';
import {
  PRESENTATION_REQUIREMENT_REPOSITORY_PORT,
  PRESENTATION_SUBMISSION_REPOSITORY_PORT,
  PresentationRequirementRepositoryPort,
  PresentationSubmissionRepositoryPort,
} from '../../domain/ports';

/**
 * Stateless read model for the presentation GET endpoints (plan §15.10) — the
 * {@link ShopQueryService} pattern: pure queries, no mutation, no events, no
 * transaction of its own. Returns domain entities; the game-session
 * presentation layer maps them to DTOs.
 *
 * Transaction-agnostic: the repository resolves its executor from the ambient
 * {@link TransactionContext}, so the same service serves both the stand-alone
 * REST reads (no transaction) and any future in-transaction call. Lives in
 * presentation (which owns the requirements catalog and the submission facts)
 * and is exported from {@link PresentationModule} so the game-session
 * presentation controller can consume it — Design A: Game Flow owns the stages
 * and the REST surface, presentation owns the reads. It grows the submission
 * reads (deadline / submissions / files) in 9.2/9.3.
 */
@Injectable()
export class PresentationQueryService {
  constructor(
    @Inject(PRESENTATION_REQUIREMENT_REPOSITORY_PORT)
    private readonly requirements: PresentationRequirementRepositoryPort,
    @Inject(PRESENTATION_SUBMISSION_REPOSITORY_PORT)
    private readonly submissions: PresentationSubmissionRepositoryPort,
  ) {}

  /** The global presentation-requirements catalog, in display order (§15.10). */
  listRequirements(): Promise<PresentationRequirement[]> {
    return this.requirements.listAll();
  }

  /**
   * The room's per-team submission facts (§15.10) for the `GET submissions`
   * status read. Empty until a team uploads (the upload write lands in 9.3).
   */
  listSubmissions(roomId: string): Promise<PresentationSubmission[]> {
    return this.submissions.findByRoomId(roomId);
  }
}

import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { PresentationQueryService } from './application/queries';
import {
  PRESENTATION_REQUIREMENT_REPOSITORY_PORT,
  PRESENTATION_SUBMISSION_REPOSITORY_PORT,
} from './domain/ports';
import {
  DrizzlePresentationRequirementRepository,
  DrizzlePresentationSubmissionRepository,
} from './infrastructure/persistence';

/**
 * Presentation feature area. Internal layering: domain / application
 * (read-only queries) / infrastructure — no presentation surface of its own,
 * the REST routes live in game-session/presentation (Design A: Game Flow owns
 * the stages), exactly as CommerceModule.
 *
 * Sub-stage 9.1 ships the skeleton: the requirement read model and submission
 * fact, the two Drizzle repositories, and the exported ports the upload use
 * cases (9.3) will consume, plus the read-only {@link PresentationQueryService}
 * (requirements catalog) exported for the game-session presentation controller.
 * Sub-stage 9.2 adds the preparation timer / submission status reads; 9.3 adds
 * the captain upload use case (consuming the FileStoragePort from
 * InfrastructureModule and the submission port exported below).
 *
 * Headless and acyclic: it does NOT import game-session, and it does NOT import
 * StorageModule in 9.1 (no use case touches the storage-write port yet) — the
 * graph game-session → presentation → infrastructure stays one-directional. No
 * RealtimeModule import: the `server:presentation:*` events are emitted by the
 * game-session use cases through the RealtimeEventsPort (9.2/9.3).
 */
@Module({
  imports: [InfrastructureModule],
  providers: [
    // Submission + requirement persistence ports → Drizzle adapters.
    {
      provide: PRESENTATION_SUBMISSION_REPOSITORY_PORT,
      useClass: DrizzlePresentationSubmissionRepository,
    },
    {
      provide: PRESENTATION_REQUIREMENT_REPOSITORY_PORT,
      useClass: DrizzlePresentationRequirementRepository,
    },
    // Read model (9.1 requirements catalog; grows in 9.2/9.3).
    PresentationQueryService,
  ],
  exports: [
    // Consumed by the game-session presentation controller + upload use cases.
    PRESENTATION_SUBMISSION_REPOSITORY_PORT,
    PRESENTATION_REQUIREMENT_REPOSITORY_PORT,
    PresentationQueryService,
  ],
})
export class PresentationModule {}

import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { EvaluationQueryService } from './application/queries';
import {
  EVALUATION_CRITERION_REPOSITORY_PORT,
  EVALUATION_SCORE_REPOSITORY_PORT,
} from './domain/ports';
import {
  DrizzleEvaluationCriterionRepository,
  DrizzleEvaluationScoreRepository,
} from './infrastructure/persistence';

/**
 * Evaluation feature area. Internal layering: domain / application (read-only
 * queries) / infrastructure — no presentation surface of its own; the REST
 * routes live in game-session/presentation (Design A: Game Flow owns the
 * EVALUATION stage), exactly as CommerceModule / PresentationModule.
 *
 * Sub-stage 10.2 revives the shell into the score-collection backbone: the
 * `EvaluationScore` fact and `EvaluationCriterion` read model, the two Drizzle
 * repositories, and the read-only {@link EvaluationQueryService} (progress
 * counts + criteria catalog). The exported ports + query feed the game-session
 * Submit/Confirm use cases and the EvaluationController. Aggregation
 * (presentationScoreRaw / finalScore / places) is Stage 10.3 and lives nowhere
 * here yet — `final_results` is untouched.
 *
 * Headless and acyclic: it imports ONLY InfrastructureModule, NEVER
 * game-session — the graph game-session → evaluation → infrastructure stays
 * one-directional. No RealtimeModule import: the `server:evaluation:*` events
 * are emitted by the game-session use cases through the RealtimeEventsPort. The
 * adapters are NOT exported (the commerce/presentation rule) — only the ports
 * and the query service.
 */
@Module({
  imports: [InfrastructureModule],
  providers: [
    // Score + criteria persistence ports → Drizzle adapters.
    {
      provide: EVALUATION_SCORE_REPOSITORY_PORT,
      useClass: DrizzleEvaluationScoreRepository,
    },
    {
      provide: EVALUATION_CRITERION_REPOSITORY_PORT,
      useClass: DrizzleEvaluationCriterionRepository,
    },
    // Read model (progress counts + criteria catalog).
    EvaluationQueryService,
  ],
  exports: [
    // Consumed by the game-session Submit/Confirm use cases + the controller.
    EVALUATION_SCORE_REPOSITORY_PORT,
    EVALUATION_CRITERION_REPOSITORY_PORT,
    EvaluationQueryService,
  ],
})
export class EvaluationModule {}

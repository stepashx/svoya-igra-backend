import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import {
  EvaluationQueryService,
  ResultsQueryService,
} from './application/queries';
import {
  EVALUATION_CRITERION_REPOSITORY_PORT,
  EVALUATION_FINAL_RESULT_REPOSITORY_PORT,
  EVALUATION_SCORE_REPOSITORY_PORT,
} from './domain/ports';
import {
  DrizzleEvaluationCriterionRepository,
  DrizzleEvaluationScoreRepository,
  DrizzleFinalResultRepository,
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
 * Submit/Confirm use cases and the EvaluationController.
 *
 * Sub-stage 10.3 closes the backbone: the {@link FinalResult} write-once fact,
 * its Drizzle adapter (`final_results`), and the read-only
 * {@link ResultsQueryService} (the public leaderboard — AGGREGATES only, the
 * individual scores stay private). The exported final-result port +
 * ResultsQueryService feed the game-session CalculateResults use case and the
 * EvaluationController's results routes; the aggregation, places and game
 * finish live in that use case (Design A).
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
    // Final-result persistence (10.3) → Drizzle adapter (write-once).
    {
      provide: EVALUATION_FINAL_RESULT_REPOSITORY_PORT,
      useClass: DrizzleFinalResultRepository,
    },
    // Read models (progress counts + criteria catalog; the final leaderboard).
    EvaluationQueryService,
    ResultsQueryService,
  ],
  exports: [
    // Consumed by the game-session Submit/Confirm/CalculateResults use cases +
    // the controller. The adapters themselves are NOT exported (only the ports).
    EVALUATION_SCORE_REPOSITORY_PORT,
    EVALUATION_CRITERION_REPOSITORY_PORT,
    EVALUATION_FINAL_RESULT_REPOSITORY_PORT,
    EvaluationQueryService,
    ResultsQueryService,
  ],
})
export class EvaluationModule {}

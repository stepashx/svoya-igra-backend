import { Module } from '@nestjs/common';
import { BOARD_INITIALIZATION_PORT } from '../game-session/application/ports';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { BoardQueryService } from './application/queries';
import { InitializeBoardUseCase } from './application/use-cases';
import {
  BOARD_CELL_REPOSITORY_PORT,
  CATEGORY_REPOSITORY_PORT,
  QUESTION_REPOSITORY_PORT,
} from './domain/ports';
import {
  DrizzleBoardCellRepository,
  DrizzleCategoryRepository,
  DrizzleQuestionRepository,
} from './infrastructure/persistence';

/**
 * Gameplay feature area. Internal layering: domain / application /
 * infrastructure (no presentation of its own).
 *
 * Sub-stage 6.1 shipped the domain skeleton (board cells, the catalog read
 * models), the three Drizzle repositories, the {@link InitializeBoardUseCase}
 * (bound to the game-session {@link BoardInitializationPort} and exported for
 * StartGame), and Board/Questions REST 501 stubs.
 *
 * Sub-stage 6.2a (Design A): the battle controllers move to game-session (Game
 * Flow owns stages/turn), so the gameplay 501 stubs are retired. Gameplay now
 * also exports the {@link BoardQueryService} read model and the three repository
 * ports, which the game-session battle use cases and controllers consume. No
 * RealtimeModule import — the `server:gameplay:*` events are emitted by the
 * game-session use cases through the RealtimeEventsPort.
 */
@Module({
  imports: [InfrastructureModule],
  providers: [
    // Catalog + board persistence ports → Drizzle adapters.
    { provide: CATEGORY_REPOSITORY_PORT, useClass: DrizzleCategoryRepository },
    { provide: QUESTION_REPOSITORY_PORT, useClass: DrizzleQuestionRepository },
    {
      provide: BOARD_CELL_REPOSITORY_PORT,
      useClass: DrizzleBoardCellRepository,
    },
    // Board-init use case, also exposed as the game-session board seam.
    InitializeBoardUseCase,
    { provide: BOARD_INITIALIZATION_PORT, useExisting: InitializeBoardUseCase },
    // Board/questions read model consumed by the game-session controllers.
    BoardQueryService,
  ],
  exports: [
    BOARD_INITIALIZATION_PORT,
    // Consumed by the game-session battle use cases (Design A).
    CATEGORY_REPOSITORY_PORT,
    QUESTION_REPOSITORY_PORT,
    BOARD_CELL_REPOSITORY_PORT,
    BoardQueryService,
  ],
})
export class GameplayModule {}

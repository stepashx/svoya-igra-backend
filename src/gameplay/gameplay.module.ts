import { Module } from '@nestjs/common';
import { BOARD_INITIALIZATION_PORT } from '../game-session/application/ports';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
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
import {
  BoardController,
  QuestionsController,
} from './presentation/controllers';

/**
 * Gameplay feature area. Internal layering: domain / application /
 * infrastructure / presentation.
 *
 * Sub-stage 6.1 ships the domain skeleton (board cells, the catalog read models)
 * and board-init: the three Drizzle repositories, the {@link InitializeBoardUseCase}
 * (bound to the game-session {@link BoardInitializationPort} via `useExisting`
 * and exported so StartGame can call it), and the Board/Questions REST routes as
 * 501 stubs. No combat use cases, timers or WebSocket emission yet — and no
 * RealtimeModule import.
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [BoardController, QuestionsController],
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
  ],
  exports: [BOARD_INITIALIZATION_PORT],
})
export class GameplayModule {}

import { Test, TestingModule } from '@nestjs/testing';
import { BOARD_INITIALIZATION_PORT } from '../game-session/application/ports';
import { ID_GENERATOR_PORT } from '../core/ports/id-generator.port';
import { DatabaseService } from '../infrastructure/database/database.service';
import { TransactionContext } from '../infrastructure/database/transaction-context';
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
 * Verifies the DI wiring of GameplayModule without the real
 * InfrastructureModule (no PostgreSQL pool). The bindings mirror the module;
 * boundary dependencies (DatabaseService, TransactionContext, ID_GENERATOR_PORT)
 * are stubbed, as in the game-session module spec.
 *
 * Sub-stage 6.2a: the 501 Board/Questions controllers are retired (the battle
 * controllers live in game-session now), and the module gains the
 * {@link BoardQueryService} read model plus exports of the three repository
 * ports consumed by the game-session battle use cases.
 */
describe('GameplayModule wiring', () => {
  const databaseStub = {
    db: {},
    transaction: jest.fn(),
  } as unknown as DatabaseService;

  const buildModule = (): Promise<TestingModule> =>
    Test.createTestingModule({
      providers: [
        { provide: DatabaseService, useValue: databaseStub },
        TransactionContext,
        { provide: ID_GENERATOR_PORT, useValue: { generate: () => 'id-1' } },
        {
          provide: CATEGORY_REPOSITORY_PORT,
          useClass: DrizzleCategoryRepository,
        },
        {
          provide: QUESTION_REPOSITORY_PORT,
          useClass: DrizzleQuestionRepository,
        },
        {
          provide: BOARD_CELL_REPOSITORY_PORT,
          useClass: DrizzleBoardCellRepository,
        },
        InitializeBoardUseCase,
        {
          provide: BOARD_INITIALIZATION_PORT,
          useExisting: InitializeBoardUseCase,
        },
        BoardQueryService,
      ],
    }).compile();

  it('resolves the three repository ports to their Drizzle adapters', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(CATEGORY_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleCategoryRepository,
    );
    expect(moduleRef.get(QUESTION_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleQuestionRepository,
    );
    expect(moduleRef.get(BOARD_CELL_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleBoardCellRepository,
    );
    await moduleRef.close();
  });

  it('binds the board-init use case to the board-initialization port', async () => {
    const moduleRef = await buildModule();
    const useCase = moduleRef.get(InitializeBoardUseCase);
    expect(useCase).toBeInstanceOf(InitializeBoardUseCase);
    // useExisting → the port resolves to the same singleton instance.
    expect(moduleRef.get(BOARD_INITIALIZATION_PORT)).toBe(useCase);
    await moduleRef.close();
  });

  it('instantiates the board query service (read model consumed by game-session)', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(BoardQueryService)).toBeInstanceOf(BoardQueryService);
    await moduleRef.close();
  });
});

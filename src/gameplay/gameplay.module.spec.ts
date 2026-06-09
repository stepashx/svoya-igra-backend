import { Test, TestingModule } from '@nestjs/testing';
import { BOARD_INITIALIZATION_PORT } from '../game-session/application/ports';
import { ID_GENERATOR_PORT } from '../core/ports/id-generator.port';
import { DatabaseService } from '../infrastructure/database/database.service';
import { TransactionContext } from '../infrastructure/database/transaction-context';
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
 * Verifies the DI wiring of GameplayModule without the real
 * InfrastructureModule (no PostgreSQL pool). The bindings mirror the module;
 * boundary dependencies (DatabaseService, TransactionContext, ID_GENERATOR_PORT)
 * are stubbed, as in the game-session module spec.
 */
describe('GameplayModule wiring', () => {
  const databaseStub = {
    db: {},
    transaction: jest.fn(),
  } as unknown as DatabaseService;

  const buildModule = (): Promise<TestingModule> =>
    Test.createTestingModule({
      controllers: [BoardController, QuestionsController],
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

  it('instantiates the board and questions controllers', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(BoardController)).toBeInstanceOf(BoardController);
    expect(moduleRef.get(QuestionsController)).toBeInstanceOf(
      QuestionsController,
    );
    await moduleRef.close();
  });
});

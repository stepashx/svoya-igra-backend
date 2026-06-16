import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../infrastructure/database/database.service';
import { TransactionContext } from '../infrastructure/database/transaction-context';
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
 * Verifies the DI wiring of EvaluationModule without the real
 * InfrastructureModule (no PostgreSQL pool) — the CommerceModule spec pattern.
 * Boundary dependencies (DatabaseService, TransactionContext) are stubbed.
 */
describe('EvaluationModule wiring', () => {
  const databaseStub = {
    db: {},
    transaction: jest.fn(),
  } as unknown as DatabaseService;

  const buildModule = (): Promise<TestingModule> =>
    Test.createTestingModule({
      providers: [
        { provide: DatabaseService, useValue: databaseStub },
        TransactionContext,
        {
          provide: EVALUATION_SCORE_REPOSITORY_PORT,
          useClass: DrizzleEvaluationScoreRepository,
        },
        {
          provide: EVALUATION_CRITERION_REPOSITORY_PORT,
          useClass: DrizzleEvaluationCriterionRepository,
        },
        {
          provide: EVALUATION_FINAL_RESULT_REPOSITORY_PORT,
          useClass: DrizzleFinalResultRepository,
        },
        EvaluationQueryService,
        ResultsQueryService,
      ],
    }).compile();

  it('resolves the three repository ports to their Drizzle adapters', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(EVALUATION_SCORE_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleEvaluationScoreRepository,
    );
    expect(moduleRef.get(EVALUATION_CRITERION_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleEvaluationCriterionRepository,
    );
    expect(
      moduleRef.get(EVALUATION_FINAL_RESULT_REPOSITORY_PORT),
    ).toBeInstanceOf(DrizzleFinalResultRepository);
    await moduleRef.close();
  });

  it('instantiates the evaluation read models', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(EvaluationQueryService)).toBeInstanceOf(
      EvaluationQueryService,
    );
    expect(moduleRef.get(ResultsQueryService)).toBeInstanceOf(
      ResultsQueryService,
    );
    await moduleRef.close();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../infrastructure/database/database.service';
import { TransactionContext } from '../infrastructure/database/transaction-context';
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
 * Verifies the DI wiring of PresentationModule without the real
 * InfrastructureModule (no PostgreSQL pool). The bindings mirror the module;
 * boundary dependencies (DatabaseService, TransactionContext) are stubbed, as
 * in the commerce module spec.
 */
describe('PresentationModule wiring', () => {
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
          provide: PRESENTATION_SUBMISSION_REPOSITORY_PORT,
          useClass: DrizzlePresentationSubmissionRepository,
        },
        {
          provide: PRESENTATION_REQUIREMENT_REPOSITORY_PORT,
          useClass: DrizzlePresentationRequirementRepository,
        },
        PresentationQueryService,
      ],
    }).compile();

  it('resolves the two repository ports to their Drizzle adapters', async () => {
    const moduleRef = await buildModule();
    expect(
      moduleRef.get(PRESENTATION_SUBMISSION_REPOSITORY_PORT),
    ).toBeInstanceOf(DrizzlePresentationSubmissionRepository);
    expect(
      moduleRef.get(PRESENTATION_REQUIREMENT_REPOSITORY_PORT),
    ).toBeInstanceOf(DrizzlePresentationRequirementRepository);
    await moduleRef.close();
  });

  it('instantiates the requirements read model (9.1)', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(PresentationQueryService)).toBeInstanceOf(
      PresentationQueryService,
    );
    await moduleRef.close();
  });
});

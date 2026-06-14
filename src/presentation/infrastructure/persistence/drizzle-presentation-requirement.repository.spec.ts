import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { DrizzlePresentationRequirementRepository } from './drizzle-presentation-requirement.repository';

describe('DrizzlePresentationRequirementRepository', () => {
  const rows = [
    {
      id: 'req-1',
      title: 'Условие 1',
      description: 'Описание условия 1',
      order: 0,
      isRequired: true,
    },
    {
      id: 'req-2',
      title: 'Условие 2',
      description: null,
      order: 1,
      isRequired: false,
    },
  ];

  /** A fake executor: `select().from().orderBy()` resolves the rows. */
  const makeExecutor = () => {
    const orderBy = jest.fn(() => Promise.resolve(rows));
    const from = jest.fn(() => ({ orderBy }));
    const select = jest.fn(() => ({ from }));
    return { select, from, orderBy };
  };

  const makeRepo = (db: ReturnType<typeof makeExecutor>) =>
    new DrizzlePresentationRequirementRepository(
      { db } as unknown as DatabaseService,
      { current: undefined } as unknown as TransactionContext,
    );

  it('lists all requirements ordered by `order`, mapped to entities', async () => {
    const db = makeExecutor();
    const requirements = await makeRepo(db).listAll();

    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.orderBy).toHaveBeenCalledTimes(1);
    expect(requirements).toHaveLength(2);
    expect(requirements[0].id).toBe('req-1');
    expect(requirements[1].description).toBeNull();
  });
});

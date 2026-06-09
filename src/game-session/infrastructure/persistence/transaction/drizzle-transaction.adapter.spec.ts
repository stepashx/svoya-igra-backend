import { DatabaseService } from '../../../../infrastructure/database/database.service';
import { DrizzleTransaction } from '../../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../../infrastructure/database/transaction-context';
import { DrizzleTransactionAdapter } from './drizzle-transaction.adapter';

describe('DrizzleTransactionAdapter', () => {
  const tx = { marker: 'tx' } as unknown as DrizzleTransaction;

  /** A DatabaseService whose `transaction` runs the callback with a fake tx. */
  const makeDatabase = () =>
    ({
      transaction: jest.fn(
        (work: (tx: DrizzleTransaction) => Promise<unknown>) => work(tx),
      ),
    }) as unknown as DatabaseService;

  it('opens a transaction and installs it as the ambient one', async () => {
    const database = makeDatabase();
    const ctx = new TransactionContext();
    const adapter = new DrizzleTransactionAdapter(database, ctx);

    const seen = await adapter.run(async () => ctx.current);

    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(seen).toBe(tx);
    expect(ctx.current).toBeUndefined();
  });

  it('returns the work result', async () => {
    const adapter = new DrizzleTransactionAdapter(
      makeDatabase(),
      new TransactionContext(),
    );
    await expect(adapter.run(async () => 'done')).resolves.toBe('done');
  });

  it('reuses the ambient transaction without opening a nested one', async () => {
    const database = makeDatabase();
    const ctx = new TransactionContext();
    const adapter = new DrizzleTransactionAdapter(database, ctx);

    await ctx.run(tx, async () => {
      await adapter.run(async () => {
        expect(ctx.current).toBe(tx);
      });
    });

    expect(database.transaction).not.toHaveBeenCalled();
  });
});

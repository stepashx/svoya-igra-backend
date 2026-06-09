import { DrizzleTransaction } from './database.types';
import { TransactionContext } from './transaction-context';

describe('TransactionContext', () => {
  const ctx = new TransactionContext();
  const tx = { marker: 'tx' } as unknown as DrizzleTransaction;

  it('has no ambient transaction outside run()', () => {
    expect(ctx.current).toBeUndefined();
  });

  it('exposes the transaction inside run() and clears it after', async () => {
    await ctx.run(tx, async () => {
      expect(ctx.current).toBe(tx);
    });
    expect(ctx.current).toBeUndefined();
  });

  it('keeps the ambient transaction across awaits', async () => {
    await ctx.run(tx, async () => {
      await Promise.resolve();
      expect(ctx.current).toBe(tx);
    });
  });

  it('returns the work result', async () => {
    await expect(ctx.run(tx, async () => 42)).resolves.toBe(42);
  });
});

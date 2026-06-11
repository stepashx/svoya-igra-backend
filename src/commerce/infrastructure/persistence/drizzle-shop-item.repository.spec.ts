import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { DrizzleShopItemRepository } from './drizzle-shop-item.repository';

/**
 * Focused on the cross-cutting behaviour: executor selection (ambient tx vs.
 * pooled client) and the row → entity mapping seam. The mapper itself is
 * covered by the mapper specs. `shop_items` writes are seed-owned, so there is
 * no 23505 path to test.
 */
describe('DrizzleShopItemRepository (tx-awareness)', () => {
  const row = {
    id: 'item-1',
    title: 'Double points',
    description: null,
    price: 300,
    qrToolId: 'qr-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  /** A fake executor whose select-chains resolve to fixtures. */
  const makeExecutor = (rows: unknown[] = []) => {
    const limit = jest.fn(() => Promise.resolve(rows));
    const where = jest.fn(() => ({ limit }));
    const from = jest.fn(() => Object.assign(Promise.resolve(rows), { where }));
    const select = jest.fn(() => ({ from }));
    return { select, from, where, limit };
  };

  const makeRepo = (
    db: ReturnType<typeof makeExecutor>,
    tx?: ReturnType<typeof makeExecutor>,
  ) =>
    new DrizzleShopItemRepository(
      { db } as unknown as DatabaseService,
      { current: tx } as unknown as TransactionContext,
    );

  it('lists the whole catalog on the pooled client when no transaction is ambient', async () => {
    const db = makeExecutor([row]);
    const items = await makeRepo(db).listAll();
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('item-1');
    expect(items[0].price).toBe(300);
  });

  it('runs reads on the ambient transaction when one is active', async () => {
    const db = makeExecutor([row]);
    const tx = makeExecutor([row]);
    await makeRepo(db, tx).listAll();
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('findById maps the row, or null when none', async () => {
    await expect(
      makeRepo(makeExecutor([row])).findById('item-1'),
    ).resolves.toMatchObject({ id: 'item-1', qrToolId: 'qr-1' });

    await expect(
      makeRepo(makeExecutor([])).findById('missing'),
    ).resolves.toBeNull();
  });
});

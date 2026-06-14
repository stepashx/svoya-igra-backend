import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { Purchase } from '../../domain/entities';
import { ItemAlreadyPurchasedError } from '../../domain/errors';
import { DrizzlePurchaseRepository } from './drizzle-purchase.repository';

/**
 * Focused on the cross-cutting behaviour: executor selection (ambient tx vs.
 * pooled client), 23505 translation for the §14.8 purchase-uniqueness race
 * (incl. the Drizzle-wrapped form, pg error on `.cause`), and the existence
 * probe. The query/mapper paths are covered by the mapper specs.
 */
describe('DrizzlePurchaseRepository (tx-awareness + 23505)', () => {
  const purchase = Purchase.create(
    {
      id: 'purchase-1',
      roomId: 'room-1',
      teamId: 'team-1',
      shopItemId: 'item-1',
      price: 300,
    },
    new Date('2026-06-11T12:00:00.000Z'),
  );

  /** A fake executor: `insert(...).values(...)` resolves or rejects, selects resolve rows. */
  const makeExecutor = (
    rows: unknown[] = [],
    onValues: () => Promise<unknown> = () => Promise.resolve(),
  ) => {
    const values = jest.fn(onValues);
    const insert = jest.fn(() => ({ values }));
    const limit = jest.fn(() => Promise.resolve(rows));
    const where = jest.fn(() =>
      Object.assign(Promise.resolve(rows), { limit }),
    );
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    return { insert, values, select, from, where, limit };
  };

  const makeRepo = (
    db: ReturnType<typeof makeExecutor>,
    tx?: ReturnType<typeof makeExecutor>,
  ) =>
    new DrizzlePurchaseRepository(
      { db } as unknown as DatabaseService,
      { current: tx } as unknown as TransactionContext,
    );

  it('runs writes on the pooled client when no transaction is ambient', async () => {
    const db = makeExecutor();
    await makeRepo(db).create(purchase);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledTimes(1);
  });

  it('runs writes on the ambient transaction when one is active', async () => {
    const db = makeExecutor();
    const tx = makeExecutor();
    await makeRepo(db, tx).create(purchase);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('translates the purchase-uniqueness 23505 into ItemAlreadyPurchasedError', async () => {
    const pgError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'purchases_room_id_shop_item_id_uq',
    });
    const db = makeExecutor([], () => Promise.reject(pgError));
    await expect(makeRepo(db).create(purchase)).rejects.toBeInstanceOf(
      ItemAlreadyPurchasedError,
    );
  });

  it('translates the Drizzle-wrapped 23505 (pg error on .cause)', async () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      query: 'insert into ...',
      cause: Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'purchases_room_id_shop_item_id_uq',
      }),
    });
    const db = makeExecutor([], () => Promise.reject(wrapped));
    await expect(makeRepo(db).create(purchase)).rejects.toBeInstanceOf(
      ItemAlreadyPurchasedError,
    );
  });

  it('re-throws an unknown-constraint 23505 unchanged', async () => {
    const pgError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'some_other_uq',
    });
    const db = makeExecutor([], () => Promise.reject(pgError));
    await expect(makeRepo(db).create(purchase)).rejects.toBe(pgError);
  });

  it('re-throws a non-23505 error unchanged', async () => {
    const error = new Error('boom');
    const db = makeExecutor([], () => Promise.reject(error));
    await expect(makeRepo(db).create(purchase)).rejects.toBe(error);
  });

  it('listByRoomId maps every row', async () => {
    const row = {
      id: 'purchase-1',
      roomId: 'room-1',
      teamId: 'team-1',
      shopItemId: 'item-1',
      price: 300,
      purchasedAt: new Date('2026-06-11T12:00:00.000Z'),
    };
    const purchases = await makeRepo(makeExecutor([row])).listByRoomId(
      'room-1',
    );
    expect(purchases).toHaveLength(1);
    expect(purchases[0].shopItemId).toBe('item-1');
  });

  it('existsByRoomAndShopItem is true when a row is present and false otherwise', async () => {
    await expect(
      makeRepo(makeExecutor([{ id: 'purchase-1' }])).existsByRoomAndShopItem(
        'room-1',
        'item-1',
      ),
    ).resolves.toBe(true);

    await expect(
      makeRepo(makeExecutor([])).existsByRoomAndShopItem('room-1', 'item-1'),
    ).resolves.toBe(false);
  });
});

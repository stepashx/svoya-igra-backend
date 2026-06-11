import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { InventoryItem } from '../../domain/entities';
import { DrizzleInventoryItemRepository } from './drizzle-inventory-item.repository';

/**
 * Focused on the cross-cutting behaviour: executor selection (ambient tx vs.
 * pooled client) for the write and the two list scopes (team view vs. host
 * room snapshot). The query/mapper paths are covered by the mapper specs.
 * `inventory_items` has no unique index, so there is no 23505 path to test.
 */
describe('DrizzleInventoryItemRepository (tx-awareness + list scopes)', () => {
  const item = InventoryItem.create(
    {
      id: 'inventory-1',
      roomId: 'room-1',
      teamId: 'team-1',
      shopItemId: 'item-1',
      qrToolId: 'qr-1',
    },
    new Date('2026-06-11T12:00:00.000Z'),
  );

  const row = {
    id: 'inventory-1',
    roomId: 'room-1',
    teamId: 'team-1',
    shopItemId: 'item-1',
    qrToolId: 'qr-1',
    addedAt: new Date('2026-06-11T12:00:00.000Z'),
  };

  /** A fake executor: `insert(...).values(...)` resolves, selects resolve rows. */
  const makeExecutor = (rows: unknown[] = []) => {
    const values = jest.fn(() => Promise.resolve());
    const insert = jest.fn(() => ({ values }));
    const where = jest.fn(() => Promise.resolve(rows));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    return { insert, values, select, from, where };
  };

  const makeRepo = (
    db: ReturnType<typeof makeExecutor>,
    tx?: ReturnType<typeof makeExecutor>,
  ) =>
    new DrizzleInventoryItemRepository(
      { db } as unknown as DatabaseService,
      { current: tx } as unknown as TransactionContext,
    );

  it('runs writes on the pooled client when no transaction is ambient', async () => {
    const db = makeExecutor();
    await makeRepo(db).create(item);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledTimes(1);
  });

  it('runs writes on the ambient transaction when one is active', async () => {
    const db = makeExecutor();
    const tx = makeExecutor();
    await makeRepo(db, tx).create(item);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('listByRoomAndTeam maps every row of the team view', async () => {
    const items = await makeRepo(makeExecutor([row])).listByRoomAndTeam(
      'room-1',
      'team-1',
    );
    expect(items).toHaveLength(1);
    expect(items[0].qrToolId).toBe('qr-1');
  });

  it('listByRoomId maps every row of the host snapshot', async () => {
    const items = await makeRepo(makeExecutor([row])).listByRoomId('room-1');
    expect(items).toHaveLength(1);
    expect(items[0].teamId).toBe('team-1');
  });
});

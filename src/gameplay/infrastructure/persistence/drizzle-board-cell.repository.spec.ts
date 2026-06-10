import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { BoardCell } from '../../domain/entities';
import { DrizzleBoardCellRepository } from './drizzle-board-cell.repository';

/**
 * Focused on the cross-cutting behaviour: executor selection (ambient tx vs.
 * pooled client) for the bulk create, the empty-board no-op, and the existence
 * probe. The query/mapper paths are covered by the mapper specs and the e2e
 * suite. `board_cells` has no unique index, so there is no 23505 path to test.
 */
describe('DrizzleBoardCellRepository (tx-awareness + existence probe)', () => {
  const cell = BoardCell.create({
    id: 'cell-1',
    roomId: 'room-1',
    questionId: 'question-1',
    categoryId: 'category-1',
    points: 100,
    position: 0,
  });

  /** A fake executor whose insert/select chains resolve to fixtures. */
  const makeExecutor = (selectRows: unknown[] = []) => {
    const values = jest.fn(() => Promise.resolve());
    const insert = jest.fn(() => ({ values }));
    const limit = jest.fn(() => Promise.resolve(selectRows));
    const where = jest.fn(() => ({ limit }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    return { insert, values, select, from, where, limit };
  };

  const makeRepo = (
    db: ReturnType<typeof makeExecutor>,
    tx?: ReturnType<typeof makeExecutor>,
  ) =>
    new DrizzleBoardCellRepository(
      { db } as unknown as DatabaseService,
      { current: tx } as unknown as TransactionContext,
    );

  it('runs createMany on the pooled client when no transaction is ambient', async () => {
    const db = makeExecutor();
    await makeRepo(db).createMany([cell]);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledTimes(1);
  });

  it('runs createMany on the ambient transaction when one is active', async () => {
    const db = makeExecutor();
    const tx = makeExecutor();
    await makeRepo(db, tx).createMany([cell]);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('does not insert when given an empty board', async () => {
    const db = makeExecutor();
    await makeRepo(db).createMany([]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('existsByRoomId is true when a row is present and false otherwise', async () => {
    await expect(
      makeRepo(makeExecutor([{ id: 'cell-1' }])).existsByRoomId('room-1'),
    ).resolves.toBe(true);

    await expect(
      makeRepo(makeExecutor([])).existsByRoomId('room-1'),
    ).resolves.toBe(false);
  });

  it('findActiveByRoomId maps the single active row, or null when none', async () => {
    const activeRow = {
      id: 'cell-7',
      roomId: 'room-1',
      questionId: 'question-7',
      categoryId: 'category-7',
      points: 400,
      position: 2,
      state: 'SELECTED',
      openedByTeamId: null,
      answeredByTeamId: null,
      blockedAt: null,
    };
    await expect(
      makeRepo(makeExecutor([activeRow])).findActiveByRoomId('room-1'),
    ).resolves.toMatchObject({ id: 'cell-7', state: 'SELECTED' });

    await expect(
      makeRepo(makeExecutor([])).findActiveByRoomId('room-1'),
    ).resolves.toBeNull();
  });

  it('runs findActiveByRoomId on the ambient transaction when one is active', async () => {
    const db = makeExecutor([]);
    const tx = makeExecutor([]);
    await makeRepo(db, tx).findActiveByRoomId('room-1');
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(db.select).not.toHaveBeenCalled();
  });
});

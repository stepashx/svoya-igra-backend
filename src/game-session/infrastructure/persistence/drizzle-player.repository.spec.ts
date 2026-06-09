import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { Player } from '../../domain/entities';
import { PlayerNameTakenError } from '../../domain/errors';
import { PlayerName, ReconnectToken } from '../../domain/value-objects';
import { DrizzlePlayerRepository } from './drizzle-player.repository';

/**
 * Focused on the cross-cutting behaviour added in 5.2a — executor selection
 * (ambient tx vs. pooled client) and 23505 translation. The query/mapper paths
 * are covered by the mapper specs and the e2e suite.
 */
describe('DrizzlePlayerRepository (tx-awareness + 23505)', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const player = Player.create(
    {
      id: 'p1',
      roomId: 'r1',
      name: PlayerName.create('Ann'),
      reconnectToken: ReconnectToken.create('tok'),
    },
    now,
  );

  /** A fake executor whose `insert(...).values(...)` resolves or rejects. */
  const makeExecutor = (onValues: () => Promise<unknown>) => ({
    insert: jest.fn(() => ({ values: jest.fn(onValues) })),
  });

  it('runs writes on the pooled client when no transaction is ambient', async () => {
    const db = makeExecutor(() => Promise.resolve());
    const repo = new DrizzlePlayerRepository(
      { db } as unknown as DatabaseService,
      { current: undefined } as unknown as TransactionContext,
    );

    await repo.create(player);

    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('runs writes on the ambient transaction when one is active', async () => {
    const db = makeExecutor(() => Promise.resolve());
    const tx = makeExecutor(() => Promise.resolve());
    const repo = new DrizzlePlayerRepository(
      { db } as unknown as DatabaseService,
      { current: tx } as unknown as TransactionContext,
    );

    await repo.create(player);

    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('translates a 23505 name-uniqueness violation into PlayerNameTakenError', async () => {
    const pgError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'players_room_id_name_uq',
    });
    const db = makeExecutor(() => Promise.reject(pgError));
    const repo = new DrizzlePlayerRepository(
      { db } as unknown as DatabaseService,
      { current: undefined } as unknown as TransactionContext,
    );

    await expect(repo.create(player)).rejects.toBeInstanceOf(
      PlayerNameTakenError,
    );
  });
});

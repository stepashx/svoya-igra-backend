import { asc } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { finalResults } from '../../../infrastructure/database/schema';
import { FinalResult } from '../../domain/entities';
import { ResultsAlreadyCalculatedError } from '../../domain/errors';
import { DrizzleFinalResultRepository } from './drizzle-final-result.repository';

// Wrap drizzle's `asc` so the deterministic (place, teamId) ordering is
// assertable — the named exports are getter-only, so a module mock is the only
// way to record the call (the ⚠️C reconnect contract).
jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    __esModule: true,
    ...actual,
    asc: jest.fn(actual.asc),
    eq: jest.fn(actual.eq),
  };
});

/**
 * Cross-cutting behaviour only: executor selection (ambient tx vs pooled
 * client), the write-once 23505 translation (incl. the Drizzle-wrapped `.cause`
 * form), and the deterministic `orderBy(place, teamId)` read contract. Mapping
 * itself is covered by the mapper spec.
 */
describe('DrizzleFinalResultRepository', () => {
  const result = FinalResult.create(
    {
      id: 'fr-1',
      roomId: 'room-1',
      teamId: 'team-1',
      earnedScore: 100,
      presentationScoreRaw: 8,
      latePenalty: 0,
      place: 1,
    },
    new Date('2026-06-16T12:00:00.000Z'),
  );

  /** A fake executor: insert chain resolves/rejects; select chain resolves rows. */
  const makeExecutor = (
    rows: unknown[] = [],
    onValues: () => Promise<unknown> = () => Promise.resolve(),
  ) => {
    const values = jest.fn(onValues);
    const insert = jest.fn(() => ({ values }));
    const orderBy = jest.fn(() => Promise.resolve(rows));
    const where = jest.fn(() => ({ orderBy }));
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    return { insert, values, select, from, where, orderBy };
  };

  const makeRepo = (
    db: ReturnType<typeof makeExecutor>,
    tx?: ReturnType<typeof makeExecutor>,
  ) =>
    new DrizzleFinalResultRepository(
      { db } as unknown as DatabaseService,
      { current: tx } as unknown as TransactionContext,
    );

  beforeEach(() => jest.clearAllMocks());

  it('writes on the pooled client when no transaction is ambient', async () => {
    const db = makeExecutor();
    await makeRepo(db).create(result);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledTimes(1);
  });

  it('writes on the ambient transaction when one is active', async () => {
    const db = makeExecutor();
    const tx = makeExecutor();
    await makeRepo(db, tx).create(result);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('translates the write-once 23505 into ResultsAlreadyCalculatedError', async () => {
    const pgError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'final_results_room_id_team_id_uq',
    });
    const db = makeExecutor([], () => Promise.reject(pgError));
    await expect(makeRepo(db).create(result)).rejects.toBeInstanceOf(
      ResultsAlreadyCalculatedError,
    );
  });

  it('translates the Drizzle-wrapped 23505 (on .cause)', async () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'final_results_room_id_team_id_uq',
      }),
    });
    const db = makeExecutor([], () => Promise.reject(wrapped));
    await expect(makeRepo(db).create(result)).rejects.toBeInstanceOf(
      ResultsAlreadyCalculatedError,
    );
  });

  it('re-throws an unknown-constraint 23505 unchanged', async () => {
    const pgError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'some_other_uq',
    });
    const db = makeExecutor([], () => Promise.reject(pgError));
    await expect(makeRepo(db).create(result)).rejects.toBe(pgError);
  });

  it('findByRoomId orders by place then teamId (deterministic reconnect read)', async () => {
    const db = makeExecutor([]);
    await makeRepo(db).findByRoomId('room-1');
    expect(asc).toHaveBeenCalledWith(finalResults.place);
    expect(asc).toHaveBeenCalledWith(finalResults.teamId);
  });

  it('findByRoomId maps every row', async () => {
    const row = {
      id: 'fr-1',
      roomId: 'room-1',
      teamId: 'team-1',
      earnedScore: 100,
      presentationScoreRaw: 8,
      latePenalty: 0,
      presentationScoreFinal: 8,
      finalScore: 800,
      place: 1,
      calculatedAt: new Date('2026-06-16T12:00:00.000Z'),
    };
    const results = await makeRepo(makeExecutor([row])).findByRoomId('room-1');
    expect(results).toHaveLength(1);
    expect(results[0].finalScore).toBe(800);
    expect(results[0].place).toBe(1);
  });
});

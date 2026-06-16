import { eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { evaluationScores } from '../../../infrastructure/database/schema';
import { EvaluationScore } from '../../domain/entities';
import { EvaluationAlreadySubmittedError } from '../../domain/errors';
import { DrizzleEvaluationScoreRepository } from './drizzle-evaluation-score.repository';

// Wrap the drizzle condition builders in jest.fn (call-through) so the ⚠️C
// HOST/TEAM lookup contract is assertable. Drizzle's named exports are
// getter-only — jest.spyOn cannot redefine them — but a module mock replaces
// the registry entry with plain, recordable functions.
jest.mock('drizzle-orm', () => {
  const actual = jest.requireActual('drizzle-orm');
  return {
    __esModule: true,
    ...actual,
    eq: jest.fn(actual.eq),
    isNull: jest.fn(actual.isNull),
  };
});

/**
 * Focused on the cross-cutting behaviour: executor selection (ambient tx vs.
 * pooled client), 23505 translation for BOTH unique indexes (incl. the
 * Drizzle-wrapped form on `.cause`), and the ⚠️C HOST `isNull` lookup contract.
 * The mapping paths are covered by the mapper specs.
 */
describe('DrizzleEvaluationScoreRepository', () => {
  const teamScore = EvaluationScore.create({
    id: 'score-1',
    roomId: 'room-1',
    targetTeamId: 'team-target',
    evaluatorType: 'TEAM',
    evaluatorTeamId: 'team-evaluator',
    hostId: null,
    topicScore: 7,
    designScore: 5,
  });

  /** A fake executor: insert/update chains resolve/reject, selects resolve rows. */
  const makeExecutor = (
    rows: unknown[] = [],
    onValues: () => Promise<unknown> = () => Promise.resolve(),
  ) => {
    const values = jest.fn(onValues);
    const insert = jest.fn(() => ({ values }));
    const setWhere = jest.fn(() => Promise.resolve());
    const set = jest.fn(() => ({ where: setWhere }));
    const update = jest.fn(() => ({ set }));
    const limit = jest.fn(() => Promise.resolve(rows));
    const where = jest.fn(() =>
      Object.assign(Promise.resolve(rows), { limit }),
    );
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    return {
      insert,
      values,
      update,
      set,
      setWhere,
      select,
      from,
      where,
      limit,
    };
  };

  const makeRepo = (
    db: ReturnType<typeof makeExecutor>,
    tx?: ReturnType<typeof makeExecutor>,
  ) =>
    new DrizzleEvaluationScoreRepository(
      { db } as unknown as DatabaseService,
      { current: tx } as unknown as TransactionContext,
    );

  beforeEach(() => jest.clearAllMocks());

  it('runs writes on the pooled client when no transaction is ambient', async () => {
    const db = makeExecutor();
    await makeRepo(db).create(teamScore);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledTimes(1);
  });

  it('runs writes on the ambient transaction when one is active', async () => {
    const db = makeExecutor();
    const tx = makeExecutor();
    await makeRepo(db, tx).create(teamScore);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('translates the TEAM-uniqueness 23505 into EvaluationAlreadySubmittedError', async () => {
    const pgError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'evaluation_scores_room_target_evaluator_uq',
    });
    const db = makeExecutor([], () => Promise.reject(pgError));
    await expect(makeRepo(db).create(teamScore)).rejects.toBeInstanceOf(
      EvaluationAlreadySubmittedError,
    );
  });

  it('translates the partial HOST-uniqueness 23505 (Drizzle-wrapped, on .cause)', async () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'evaluation_scores_host_per_target_uq',
      }),
    });
    const db = makeExecutor([], () => Promise.reject(wrapped));
    await expect(makeRepo(db).create(teamScore)).rejects.toBeInstanceOf(
      EvaluationAlreadySubmittedError,
    );
  });

  it('re-throws an unknown-constraint 23505 unchanged', async () => {
    const pgError = Object.assign(new Error('duplicate'), {
      code: '23505',
      constraint: 'some_other_uq',
    });
    const db = makeExecutor([], () => Promise.reject(pgError));
    await expect(makeRepo(db).create(teamScore)).rejects.toBe(pgError);
  });

  it('update runs an UPDATE keyed on the row id (no 23505 translation)', async () => {
    const db = makeExecutor();
    await makeRepo(db).update(teamScore);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.set).toHaveBeenCalledTimes(1);
    expect(db.setWhere).toHaveBeenCalledTimes(1);
  });

  it('findByRoomTargetEvaluator HOST uses isNull(evaluator_team_id), never eq', async () => {
    const db = makeExecutor([]);

    await makeRepo(db).findByRoomTargetEvaluator(
      'room-1',
      'team-target',
      'HOST',
      null,
    );

    expect(isNull).toHaveBeenCalledWith(evaluationScores.evaluatorTeamId);
    // eq is used for room/target/type but NEVER for the nullable evaluator column.
    expect(eq).not.toHaveBeenCalledWith(
      evaluationScores.evaluatorTeamId,
      expect.anything(),
    );
  });

  it('findByRoomTargetEvaluator TEAM matches eq(evaluator_team_id), never isNull', async () => {
    const db = makeExecutor([]);

    await makeRepo(db).findByRoomTargetEvaluator(
      'room-1',
      'team-target',
      'TEAM',
      'team-evaluator',
    );

    expect(eq).toHaveBeenCalledWith(
      evaluationScores.evaluatorTeamId,
      'team-evaluator',
    );
    expect(isNull).not.toHaveBeenCalled();
  });

  it('findByRoomTargetEvaluator returns null when no row matches', async () => {
    const db = makeExecutor([]);
    await expect(
      makeRepo(db).findByRoomTargetEvaluator(
        'room-1',
        'team-target',
        'TEAM',
        'team-evaluator',
      ),
    ).resolves.toBeNull();
  });

  it('findByRoomId maps every row', async () => {
    const row = {
      id: 'score-1',
      roomId: 'room-1',
      targetTeamId: 'team-target',
      evaluatorType: 'TEAM',
      evaluatorTeamId: 'team-evaluator',
      hostId: null,
      topicScore: 7,
      designScore: 5,
      totalScore: 12,
      weight: 1,
      confirmedAt: null,
    };
    const scores = await makeRepo(makeExecutor([row])).findByRoomId('room-1');
    expect(scores).toHaveLength(1);
    expect(scores[0].totalScore).toBe(12);
    expect(scores[0].weight).toBe(1);
  });
});

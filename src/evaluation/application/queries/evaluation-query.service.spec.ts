import { EvaluationCriterion, EvaluationScore } from '../../domain/entities';
import {
  EvaluationCriterionRepositoryPort,
  EvaluationScoreRepositoryPort,
} from '../../domain/ports';
import { EvaluatorType } from '../../domain/types';
import { EvaluationQueryService } from './evaluation-query.service';

describe('EvaluationQueryService', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  let counter = 0;

  const teamScore = (
    target: string,
    evaluator: string,
    confirmed: boolean,
  ): EvaluationScore => {
    counter += 1;
    const score = EvaluationScore.create({
      id: `team-${counter}`,
      roomId: 'room-1',
      targetTeamId: target,
      evaluatorType: 'TEAM',
      evaluatorTeamId: evaluator,
      hostId: null,
      topicScore: 5,
      designScore: 5,
    });
    return confirmed ? score.confirm(now) : score;
  };

  const hostScore = (target: string, confirmed: boolean): EvaluationScore => {
    counter += 1;
    const score = EvaluationScore.create({
      id: `host-${counter}`,
      roomId: 'room-1',
      targetTeamId: target,
      evaluatorType: 'HOST',
      evaluatorTeamId: null,
      hostId: 'host-1',
      topicScore: 6,
      designScore: 4,
    });
    return confirmed ? score.confirm(now) : score;
  };

  const makeScoreRepo = (
    scores: EvaluationScore[],
  ): jest.Mocked<EvaluationScoreRepositoryPort> => ({
    create: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    findByRoomTargetEvaluator: jest.fn().mockResolvedValue(null),
    findByRoomId: jest.fn().mockResolvedValue(scores),
  });

  const makeCriterionRepo = (
    criteria: EvaluationCriterion[] = [],
  ): jest.Mocked<EvaluationCriterionRepositoryPort> => ({
    listAll: jest.fn().mockResolvedValue(criteria),
  });

  const makeService = (scores: EvaluationScore[]) =>
    new EvaluationQueryService(makeScoreRepo(scores), makeCriterionRepo());

  beforeEach(() => {
    counter = 0;
  });

  it('N=2 complete: team 2/2, host 2/2, total expected 4', async () => {
    const scores = [
      teamScore('A', 'B', true),
      teamScore('B', 'A', true),
      hostScore('A', true),
      hostScore('B', true),
    ];
    const progress = await makeService(scores).getProgress('room-1', 2);

    expect(progress.teamCount).toBe(2);
    expect(progress.team).toEqual({ submitted: 2, confirmed: 2, expected: 2 });
    expect(progress.host).toEqual({ submitted: 2, confirmed: 2, expected: 2 });
    expect(progress.totalExpected).toBe(4);
    expect(progress.complete).toBe(true);
  });

  it('N=2 partial: a submitted-but-unconfirmed score is not complete', async () => {
    const scores = [
      teamScore('A', 'B', true),
      teamScore('B', 'A', false), // submitted, not confirmed
      hostScore('A', true),
      hostScore('B', true),
    ];
    const progress = await makeService(scores).getProgress('room-1', 2);

    expect(progress.team).toEqual({ submitted: 2, confirmed: 1, expected: 2 });
    expect(progress.complete).toBe(false);
  });

  it('N=3: team expected 6, host expected 3, total 9', async () => {
    const progress = await makeService([]).getProgress('room-1', 3);

    expect(progress.team.expected).toBe(6);
    expect(progress.host.expected).toBe(3);
    expect(progress.totalExpected).toBe(9);
    expect(progress.complete).toBe(false);
  });

  it('expected is derived purely from teamCount — a captainless team never inflates it', async () => {
    // Three teams exist but only two have a captain → caller passes teamCount 2,
    // and the expectation collapses to the N=2 shape regardless of stray rows.
    const scores = [teamScore('A', 'B', true), hostScore('C', true)];
    const progress = await makeService(scores).getProgress('room-1', 2);

    expect(progress.team.expected).toBe(2);
    expect(progress.host.expected).toBe(2);
    expect(progress.totalExpected).toBe(4);
  });

  it('listCriteria returns the catalog from the port', async () => {
    const criteria = [
      EvaluationCriterion.reconstitute({
        id: 'c1',
        title: 'Раскрытие темы',
        description: null,
        minScore: 0,
        maxScore: 10,
        order: 0,
      }),
    ];
    const service = new EvaluationQueryService(
      makeScoreRepo([]),
      makeCriterionRepo(criteria),
    );
    await expect(service.listCriteria()).resolves.toEqual(criteria);
  });

  it('caps an evaluator union value to the domain type at compile time', () => {
    // A static assertion that the EvaluatorType import stays referenced and
    // matches the entity's surface (the mapper relies on the same union).
    const type: EvaluatorType = 'TEAM';
    expect(type).toBe('TEAM');
  });
});

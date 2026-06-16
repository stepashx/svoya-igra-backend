import { evaluationScores } from '../../../../infrastructure/database/schema';
import { EvaluationScore } from '../../../domain/entities';
import {
  mapEvaluationScoreToInsert,
  mapEvaluationScoreToUpdate,
  mapRowToEvaluationScore,
} from './evaluation-score.mapper';

describe('evaluation-score.mapper', () => {
  const confirmedAt = new Date('2026-06-15T12:30:00.000Z');

  it('maps a row to an entity (carrying persisted total/weight verbatim)', () => {
    const row: typeof evaluationScores.$inferSelect = {
      id: 'score-1',
      roomId: 'room-1',
      targetTeamId: 'team-target',
      evaluatorType: 'HOST',
      evaluatorTeamId: null,
      hostId: 'host-1',
      topicScore: 8,
      designScore: 6,
      totalScore: 14,
      weight: 2,
      confirmedAt,
    };
    const score = mapRowToEvaluationScore(row);
    expect(score.id).toBe('score-1');
    expect(score.evaluatorType).toBe('HOST');
    expect(score.evaluatorTeamId).toBeNull();
    expect(score.hostId).toBe('host-1');
    expect(score.totalScore).toBe(14);
    expect(score.weight).toBe(2);
    expect(score.confirmedAt).toBe(confirmedAt);
  });

  it('maps a fresh entity to a full insert payload (confirmedAt null) round-trip', () => {
    const score = EvaluationScore.create({
      id: 'score-2',
      roomId: 'room-1',
      targetTeamId: 'team-target',
      evaluatorType: 'TEAM',
      evaluatorTeamId: 'team-evaluator',
      hostId: null,
      topicScore: 7,
      designScore: 5,
    });
    const insert = mapEvaluationScoreToInsert(score);
    expect(insert).toEqual({
      id: 'score-2',
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
    });
    expect(
      mapRowToEvaluationScore(insert as typeof evaluationScores.$inferSelect),
    ).toEqual(score);
  });

  it('maps an entity to a partial UPDATE payload (mutable columns only)', () => {
    const confirmed = EvaluationScore.create({
      id: 'score-3',
      roomId: 'room-1',
      targetTeamId: 'team-target',
      evaluatorType: 'TEAM',
      evaluatorTeamId: 'team-evaluator',
      hostId: null,
      topicScore: 9,
      designScore: 1,
    }).confirm(confirmedAt);

    const update = mapEvaluationScoreToUpdate(confirmed);
    // Only the scoring columns + confirmedAt — never the evaluator identity.
    expect(update).toEqual({
      topicScore: 9,
      designScore: 1,
      totalScore: 10,
      weight: 1,
      confirmedAt,
    });
    expect(update).not.toHaveProperty('id');
    expect(update).not.toHaveProperty('evaluatorTeamId');
  });
});

import { evaluationCriteria } from '../../../../infrastructure/database/schema';
import { mapRowToEvaluationCriterion } from './evaluation-criterion.mapper';

describe('evaluation-criterion.mapper', () => {
  it('maps a row to a criterion entity', () => {
    const row: typeof evaluationCriteria.$inferSelect = {
      id: 'c1770000-0000-4000-8000-000000000001',
      title: 'Раскрытие темы',
      description: 'Критерий «Раскрытие темы»',
      minScore: 0,
      maxScore: 10,
      order: 0,
    };
    const criterion = mapRowToEvaluationCriterion(row);
    expect(criterion.id).toBe('c1770000-0000-4000-8000-000000000001');
    expect(criterion.title).toBe('Раскрытие темы');
    expect(criterion.minScore).toBe(0);
    expect(criterion.maxScore).toBe(10);
    expect(criterion.order).toBe(0);
  });
});

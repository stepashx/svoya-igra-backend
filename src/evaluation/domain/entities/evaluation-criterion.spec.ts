import { EvaluationCriterion } from './evaluation-criterion';

describe('EvaluationCriterion', () => {
  it('reconstitutes a persisted criterion round-trip', () => {
    const criterion = EvaluationCriterion.reconstitute({
      id: 'c1770000-0000-4000-8000-000000000001',
      title: 'Раскрытие темы',
      description: 'Критерий «Раскрытие темы»',
      minScore: 0,
      maxScore: 10,
      order: 0,
    });
    expect(criterion.id).toBe('c1770000-0000-4000-8000-000000000001');
    expect(criterion.title).toBe('Раскрытие темы');
    expect(criterion.description).toBe('Критерий «Раскрытие темы»');
    expect(criterion.minScore).toBe(0);
    expect(criterion.maxScore).toBe(10);
    expect(criterion.order).toBe(0);
  });

  it('carries a null description', () => {
    const criterion = EvaluationCriterion.reconstitute({
      id: 'c2',
      title: 'No description',
      description: null,
      minScore: 0,
      maxScore: 10,
      order: 1,
    });
    expect(criterion.description).toBeNull();
  });
});

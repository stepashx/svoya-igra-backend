import { evaluationCriteria } from '../../../../infrastructure/database/schema';
import { EvaluationCriterion } from '../../../domain/entities';

type EvaluationCriterionRow = typeof evaluationCriteria.$inferSelect;

/** Row → entity. Criteria are a read-only seed catalog, so there is no write mapper. */
export function mapRowToEvaluationCriterion(
  row: EvaluationCriterionRow,
): EvaluationCriterion {
  return EvaluationCriterion.reconstitute({
    id: row.id,
    title: row.title,
    description: row.description,
    minScore: row.minScore,
    maxScore: row.maxScore,
    order: row.order,
  });
}

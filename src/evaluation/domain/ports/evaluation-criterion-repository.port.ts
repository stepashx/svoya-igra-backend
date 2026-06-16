import { EvaluationCriterion } from '../entities';

/**
 * Persistence port for the seeded evaluation criteria catalog (plan §12). A
 * global, immutable, room-independent read surface — `listAll` returns the
 * criteria ordered by `order` ascending (the order the submit use case maps to
 * `topicScore` / `designScore`). The Drizzle adapter lives in
 * infrastructure/persistence.
 */
export interface EvaluationCriterionRepositoryPort {
  listAll(): Promise<EvaluationCriterion[]>;
}

export const EVALUATION_CRITERION_REPOSITORY_PORT = Symbol(
  'EvaluationCriterionRepositoryPort',
);

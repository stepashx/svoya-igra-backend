import { EvaluationScore } from '../entities';
import { EvaluatorType } from '../types';

/**
 * Persistence port for evaluation scores (plan §12, §15.11). `create` is the
 * first write under the per-room advisory lock — its unique-index 23505 is the
 * defensive net translated to {@link EvaluationAlreadySubmittedError}; `update`
 * carries both a re-evaluation (a fresh score before confirm) and a confirm (the
 * Variant-A instance with `confirmedAt`). `findByRoomTargetEvaluator` resolves
 * the at-most-one row for an evaluator: for a HOST it must match on
 * `isNull(evaluator_team_id)` (a SQL `= null` never matches, so eq-on-null would
 * miss the host's own draft and force a false 23505). The Drizzle adapter lives
 * in infrastructure/persistence.
 */
export interface EvaluationScoreRepositoryPort {
  create(score: EvaluationScore): Promise<void>;
  update(score: EvaluationScore): Promise<void>;
  findByRoomTargetEvaluator(
    roomId: string,
    targetTeamId: string,
    evaluatorType: EvaluatorType,
    evaluatorTeamId: string | null,
  ): Promise<EvaluationScore | null>;
  findByRoomId(roomId: string): Promise<EvaluationScore[]>;
}

export const EVALUATION_SCORE_REPOSITORY_PORT = Symbol(
  'EvaluationScoreRepositoryPort',
);

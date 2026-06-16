import { evaluationScores } from '../../../../infrastructure/database/schema';
import { EvaluationScore } from '../../../domain/entities';

type EvaluationScoreRow = typeof evaluationScores.$inferSelect;
type EvaluationScoreInsert = typeof evaluationScores.$inferInsert;
type EvaluationScoreUpdate = Partial<EvaluationScoreInsert>;

/**
 * Row → entity. The schema `evaluatorType` union is assigned to the domain
 * union here (and back on write); the assignment only type-checks while the two
 * stay identical, so any drift breaks the build.
 */
export function mapRowToEvaluationScore(
  row: EvaluationScoreRow,
): EvaluationScore {
  return EvaluationScore.reconstitute({
    id: row.id,
    roomId: row.roomId,
    targetTeamId: row.targetTeamId,
    evaluatorType: row.evaluatorType,
    evaluatorTeamId: row.evaluatorTeamId,
    hostId: row.hostId,
    topicScore: row.topicScore,
    designScore: row.designScore,
    totalScore: row.totalScore,
    weight: row.weight,
    confirmedAt: row.confirmedAt,
  });
}

/**
 * Entity → full insert payload. The domain DERIVES `totalScore`/`weight` and
 * starts `confirmedAt` null, so the row matches the create-time invariant
 * exactly (the column default is never relied upon).
 */
export function mapEvaluationScoreToInsert(
  score: EvaluationScore,
): EvaluationScoreInsert {
  return {
    id: score.id,
    roomId: score.roomId,
    targetTeamId: score.targetTeamId,
    evaluatorType: score.evaluatorType,
    evaluatorTeamId: score.evaluatorTeamId,
    hostId: score.hostId,
    topicScore: score.topicScore,
    designScore: score.designScore,
    totalScore: score.totalScore,
    weight: score.weight,
    confirmedAt: score.confirmedAt,
  };
}

/**
 * Entity → partial UPDATE payload, keyed on the row `id`. Carries the only
 * columns that change after creation: a re-evaluation overwrites the scoring
 * fields (still derived by the entity), and a confirm sets `confirmedAt`. The
 * evaluator identity (room/target/type/team/host) is fixed for a row, so it is
 * never updated.
 */
export function mapEvaluationScoreToUpdate(
  score: EvaluationScore,
): EvaluationScoreUpdate {
  return {
    topicScore: score.topicScore,
    designScore: score.designScore,
    totalScore: score.totalScore,
    weight: score.weight,
    confirmedAt: score.confirmedAt,
  };
}

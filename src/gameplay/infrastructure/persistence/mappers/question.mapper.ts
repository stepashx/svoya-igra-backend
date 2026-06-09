import { questions } from '../../../../infrastructure/database/schema';
import { Question } from '../../../domain/entities';

type QuestionRow = typeof questions.$inferSelect;

/**
 * Row → entity. Questions are read-only (a seed-managed catalog), so there is no
 * insert/update mapper. `correctAnswer` is carried into the entity; gating its
 * exposure is a presentation concern, not a persistence one.
 */
export function mapRowToQuestion(row: QuestionRow): Question {
  return Question.reconstitute({
    id: row.id,
    categoryId: row.categoryId,
    text: row.text,
    correctAnswer: row.correctAnswer,
    points: row.points,
    position: row.position,
    createdAt: row.createdAt,
  });
}

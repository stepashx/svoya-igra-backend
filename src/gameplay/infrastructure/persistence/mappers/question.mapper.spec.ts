import { questions } from '../../../../infrastructure/database/schema';
import { mapRowToQuestion } from './question.mapper';

describe('question.mapper', () => {
  it('maps a row to a question entity, carrying the correct answer', () => {
    const row: typeof questions.$inferSelect = {
      id: 'question-1',
      categoryId: 'category-1',
      text: 'What is 2 + 2?',
      correctAnswer: '4',
      points: 400,
      position: 2,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const question = mapRowToQuestion(row);
    expect(question.id).toBe('question-1');
    expect(question.categoryId).toBe('category-1');
    expect(question.text).toBe('What is 2 + 2?');
    expect(question.correctAnswer).toBe('4');
    expect(question.points).toBe(400);
    expect(question.position).toBe(2);
    expect(question.createdAt).toBe(row.createdAt);
  });
});

import { Question } from './question';

describe('Question', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');

  const make = (): Question =>
    Question.reconstitute({
      id: 'question-1',
      categoryId: 'category-1',
      text: 'What is 2 + 2?',
      correctAnswer: '4',
      points: 400,
      position: 2,
      createdAt,
    });

  it('reconstitutes and exposes every field through getters', () => {
    const question = make();
    expect(question.id).toBe('question-1');
    expect(question.categoryId).toBe('category-1');
    expect(question.text).toBe('What is 2 + 2?');
    expect(question.points).toBe(400);
    expect(question.position).toBe(2);
    expect(question.createdAt).toBe(createdAt);
  });

  it('exposes the host-only correct answer through a getter', () => {
    expect(make().correctAnswer).toBe('4');
  });
});

import { Question } from '../entities';

/**
 * Persistence port for the global question catalog (plan §15.6, Этап2 §8).
 * Read-only — questions are seed-managed. The Drizzle adapter lives in
 * infrastructure/persistence.
 */
export interface QuestionRepositoryPort {
  listAll(): Promise<Question[]>;
  findById(id: string): Promise<Question | null>;
  listByCategoryId(categoryId: string): Promise<Question[]>;
}

export const QUESTION_REPOSITORY_PORT = Symbol('QuestionRepositoryPort');

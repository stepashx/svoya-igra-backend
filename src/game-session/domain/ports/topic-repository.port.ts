import { Topic } from '../entities';

/**
 * Persistence port for the global topic catalog (Этап2 §15). Read-only — topics
 * are seed-managed. The Drizzle adapter lives in infrastructure/persistence.
 */
export interface TopicRepositoryPort {
  findAll(): Promise<Topic[]>;
  findById(id: string): Promise<Topic | null>;
}

export const TOPIC_REPOSITORY_PORT = Symbol('TopicRepositoryPort');

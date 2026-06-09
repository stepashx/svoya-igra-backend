import { Category } from '../entities';

/**
 * Persistence port for the global category catalog (plan §15.5). Read-only —
 * categories are seed-managed. The Drizzle adapter lives in
 * infrastructure/persistence.
 */
export interface CategoryRepositoryPort {
  listAll(): Promise<Category[]>;
  findById(id: string): Promise<Category | null>;
}

export const CATEGORY_REPOSITORY_PORT = Symbol('CategoryRepositoryPort');

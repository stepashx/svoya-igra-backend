import { categories } from '../../../../infrastructure/database/schema';
import { Category } from '../../../domain/entities';

type CategoryRow = typeof categories.$inferSelect;

/**
 * Row → entity. Categories are read-only (a seed-managed catalog), so there is
 * no insert/update mapper — the seed owns writes.
 */
export function mapRowToCategory(row: CategoryRow): Category {
  return Category.reconstitute({
    id: row.id,
    title: row.title,
    position: row.position,
  });
}

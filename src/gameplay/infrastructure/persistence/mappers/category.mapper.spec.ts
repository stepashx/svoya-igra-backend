import { categories } from '../../../../infrastructure/database/schema';
import { mapRowToCategory } from './category.mapper';

describe('category.mapper', () => {
  it('maps a row to a category entity', () => {
    const row: typeof categories.$inferSelect = {
      id: 'category-1',
      title: 'Science',
      position: 2,
    };
    const category = mapRowToCategory(row);
    expect(category.id).toBe('category-1');
    expect(category.title).toBe('Science');
    expect(category.position).toBe(2);
  });
});

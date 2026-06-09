import { Category } from './category';

describe('Category', () => {
  it('reconstitutes and exposes every field through getters', () => {
    const category = Category.reconstitute({
      id: 'category-1',
      title: 'Science',
      position: 3,
    });
    expect(category.id).toBe('category-1');
    expect(category.title).toBe('Science');
    expect(category.position).toBe(3);
  });
});

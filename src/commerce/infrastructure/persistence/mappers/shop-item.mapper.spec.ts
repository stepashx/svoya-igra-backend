import { shopItems } from '../../../../infrastructure/database/schema';
import { mapRowToShopItem } from './shop-item.mapper';

describe('shop-item.mapper', () => {
  it('maps a row to a shop-item entity', () => {
    const row: typeof shopItems.$inferSelect = {
      id: 'item-1',
      title: 'Double points',
      description: 'Doubles the next answer score.',
      price: 300,
      qrToolId: 'qr-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const item = mapRowToShopItem(row);
    expect(item.id).toBe('item-1');
    expect(item.title).toBe('Double points');
    expect(item.description).toBe('Doubles the next answer score.');
    expect(item.price).toBe(300);
    expect(item.qrToolId).toBe('qr-1');
    expect(item.createdAt).toBe(row.createdAt);
  });

  it('carries a null description through', () => {
    const row: typeof shopItems.$inferSelect = {
      id: 'item-2',
      title: 'Hint',
      description: null,
      price: 100,
      qrToolId: 'qr-2',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    expect(mapRowToShopItem(row).description).toBeNull();
  });
});

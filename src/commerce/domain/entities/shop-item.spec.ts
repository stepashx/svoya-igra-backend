import { ShopItem } from './shop-item';

describe('ShopItem', () => {
  it('reconstitutes and exposes every field through getters', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const item = ShopItem.reconstitute({
      id: 'item-1',
      title: 'Double points',
      description: 'Doubles the next answer score.',
      price: 300,
      qrToolId: 'qr-1',
      createdAt,
    });
    expect(item.id).toBe('item-1');
    expect(item.title).toBe('Double points');
    expect(item.description).toBe('Doubles the next answer score.');
    expect(item.price).toBe(300);
    expect(item.qrToolId).toBe('qr-1');
    expect(item.createdAt).toBe(createdAt);
  });

  it('carries a null description', () => {
    const item = ShopItem.reconstitute({
      id: 'item-2',
      title: 'Hint',
      description: null,
      price: 100,
      qrToolId: 'qr-2',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(item.description).toBeNull();
  });
});

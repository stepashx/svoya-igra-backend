import { Purchase } from './purchase';

describe('Purchase', () => {
  const now = new Date('2026-06-11T12:00:00.000Z');

  it('creates a purchase stamped with the supplied moment', () => {
    const purchase = Purchase.create(
      {
        id: 'purchase-1',
        roomId: 'room-1',
        teamId: 'team-1',
        shopItemId: 'item-1',
        price: 300,
      },
      now,
    );
    expect(purchase.id).toBe('purchase-1');
    expect(purchase.roomId).toBe('room-1');
    expect(purchase.teamId).toBe('team-1');
    expect(purchase.shopItemId).toBe('item-1');
    expect(purchase.price).toBe(300);
    expect(purchase.purchasedAt).toBe(now);
  });

  it('reconstitutes a persisted purchase round-trip', () => {
    const purchasedAt = new Date('2026-06-11T12:30:00.000Z');
    const purchase = Purchase.reconstitute({
      id: 'purchase-2',
      roomId: 'room-1',
      teamId: 'team-2',
      shopItemId: 'item-3',
      price: 500,
      purchasedAt,
    });
    expect(purchase.id).toBe('purchase-2');
    expect(purchase.roomId).toBe('room-1');
    expect(purchase.teamId).toBe('team-2');
    expect(purchase.shopItemId).toBe('item-3');
    expect(purchase.price).toBe(500);
    expect(purchase.purchasedAt).toBe(purchasedAt);
  });
});

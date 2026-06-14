import { purchases } from '../../../../infrastructure/database/schema';
import { Purchase } from '../../../domain/entities';
import { mapPurchaseToInsert, mapRowToPurchase } from './purchase.mapper';

describe('purchase.mapper', () => {
  const purchasedAt = new Date('2026-06-11T12:00:00.000Z');

  it('maps a row to a purchase entity', () => {
    const row: typeof purchases.$inferSelect = {
      id: 'purchase-1',
      roomId: 'room-1',
      teamId: 'team-1',
      shopItemId: 'item-1',
      price: 300,
      purchasedAt,
    };
    const purchase = mapRowToPurchase(row);
    expect(purchase.id).toBe('purchase-1');
    expect(purchase.roomId).toBe('room-1');
    expect(purchase.teamId).toBe('team-1');
    expect(purchase.shopItemId).toBe('item-1');
    expect(purchase.price).toBe(300);
    expect(purchase.purchasedAt).toBe(purchasedAt);
  });

  it('maps an entity to a full insert payload (incl. purchasedAt) round-trip', () => {
    const purchase = Purchase.create(
      {
        id: 'purchase-1',
        roomId: 'room-1',
        teamId: 'team-1',
        shopItemId: 'item-1',
        price: 300,
      },
      purchasedAt,
    );
    const insert = mapPurchaseToInsert(purchase);
    expect(insert).toEqual({
      id: 'purchase-1',
      roomId: 'room-1',
      teamId: 'team-1',
      shopItemId: 'item-1',
      price: 300,
      purchasedAt,
    });
    expect(mapRowToPurchase(insert as typeof purchases.$inferSelect)).toEqual(
      purchase,
    );
  });
});

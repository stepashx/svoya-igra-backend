import { InventoryItem } from './inventory-item';

describe('InventoryItem', () => {
  const now = new Date('2026-06-11T12:00:00.000Z');

  it('creates an inventory entry stamped with the supplied moment', () => {
    const item = InventoryItem.create(
      {
        id: 'inventory-1',
        roomId: 'room-1',
        teamId: 'team-1',
        shopItemId: 'item-1',
        qrToolId: 'qr-1',
      },
      now,
    );
    expect(item.id).toBe('inventory-1');
    expect(item.roomId).toBe('room-1');
    expect(item.teamId).toBe('team-1');
    expect(item.shopItemId).toBe('item-1');
    expect(item.qrToolId).toBe('qr-1');
    expect(item.addedAt).toBe(now);
  });

  it('reconstitutes a persisted inventory entry round-trip', () => {
    const addedAt = new Date('2026-06-11T12:30:00.000Z');
    const item = InventoryItem.reconstitute({
      id: 'inventory-2',
      roomId: 'room-1',
      teamId: 'team-2',
      shopItemId: 'item-3',
      qrToolId: 'qr-3',
      addedAt,
    });
    expect(item.id).toBe('inventory-2');
    expect(item.roomId).toBe('room-1');
    expect(item.teamId).toBe('team-2');
    expect(item.shopItemId).toBe('item-3');
    expect(item.qrToolId).toBe('qr-3');
    expect(item.addedAt).toBe(addedAt);
  });
});

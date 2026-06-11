import { inventoryItems } from '../../../../infrastructure/database/schema';
import { InventoryItem } from '../../../domain/entities';
import {
  mapInventoryItemToInsert,
  mapRowToInventoryItem,
} from './inventory-item.mapper';

describe('inventory-item.mapper', () => {
  const addedAt = new Date('2026-06-11T12:00:00.000Z');

  it('maps a row to an inventory-item entity', () => {
    const row: typeof inventoryItems.$inferSelect = {
      id: 'inventory-1',
      roomId: 'room-1',
      teamId: 'team-1',
      shopItemId: 'item-1',
      qrToolId: 'qr-1',
      addedAt,
    };
    const item = mapRowToInventoryItem(row);
    expect(item.id).toBe('inventory-1');
    expect(item.roomId).toBe('room-1');
    expect(item.teamId).toBe('team-1');
    expect(item.shopItemId).toBe('item-1');
    expect(item.qrToolId).toBe('qr-1');
    expect(item.addedAt).toBe(addedAt);
  });

  it('maps an entity to a full insert payload (incl. addedAt) round-trip', () => {
    const item = InventoryItem.create(
      {
        id: 'inventory-1',
        roomId: 'room-1',
        teamId: 'team-1',
        shopItemId: 'item-1',
        qrToolId: 'qr-1',
      },
      addedAt,
    );
    const insert = mapInventoryItemToInsert(item);
    expect(insert).toEqual({
      id: 'inventory-1',
      roomId: 'room-1',
      teamId: 'team-1',
      shopItemId: 'item-1',
      qrToolId: 'qr-1',
      addedAt,
    });
    expect(
      mapRowToInventoryItem(insert as typeof inventoryItems.$inferSelect),
    ).toEqual(item);
  });
});

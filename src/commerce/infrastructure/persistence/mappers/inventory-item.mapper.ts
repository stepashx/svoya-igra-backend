import { inventoryItems } from '../../../../infrastructure/database/schema';
import { InventoryItem } from '../../../domain/entities';

type InventoryItemRow = typeof inventoryItems.$inferSelect;
type InventoryItemInsert = typeof inventoryItems.$inferInsert;

/** Row → entity. Inventory entries are immutable facts, so there is no update mapper. */
export function mapRowToInventoryItem(row: InventoryItemRow): InventoryItem {
  return InventoryItem.reconstitute({
    id: row.id,
    roomId: row.roomId,
    teamId: row.teamId,
    shopItemId: row.shopItemId,
    qrToolId: row.qrToolId,
    addedAt: row.addedAt,
  });
}

/**
 * Entity → full insert payload, including `addedAt` — the domain stamps the
 * moment (ClockPort), so the column default is not relied upon.
 */
export function mapInventoryItemToInsert(
  item: InventoryItem,
): InventoryItemInsert {
  return {
    id: item.id,
    roomId: item.roomId,
    teamId: item.teamId,
    shopItemId: item.shopItemId,
    qrToolId: item.qrToolId,
    addedAt: item.addedAt,
  };
}

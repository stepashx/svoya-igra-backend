import { shopItems } from '../../../../infrastructure/database/schema';
import { ShopItem } from '../../../domain/entities';

type ShopItemRow = typeof shopItems.$inferSelect;

/**
 * Row → entity. Shop items are read-only (a seed-managed catalog), so there is
 * no insert/update mapper — the seed owns writes.
 */
export function mapRowToShopItem(row: ShopItemRow): ShopItem {
  return ShopItem.reconstitute({
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    qrToolId: row.qrToolId,
    createdAt: row.createdAt,
  });
}

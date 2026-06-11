import { purchases } from '../../../../infrastructure/database/schema';
import { Purchase } from '../../../domain/entities';

type PurchaseRow = typeof purchases.$inferSelect;
type PurchaseInsert = typeof purchases.$inferInsert;

/** Row → entity. Purchases are immutable facts, so there is no update mapper. */
export function mapRowToPurchase(row: PurchaseRow): Purchase {
  return Purchase.reconstitute({
    id: row.id,
    roomId: row.roomId,
    teamId: row.teamId,
    shopItemId: row.shopItemId,
    price: row.price,
    purchasedAt: row.purchasedAt,
  });
}

/**
 * Entity → full insert payload, including `purchasedAt` — the domain stamps
 * the moment (ClockPort), so the column default is not relied upon.
 */
export function mapPurchaseToInsert(purchase: Purchase): PurchaseInsert {
  return {
    id: purchase.id,
    roomId: purchase.roomId,
    teamId: purchase.teamId,
    shopItemId: purchase.shopItemId,
    price: purchase.price,
    purchasedAt: purchase.purchasedAt,
  };
}

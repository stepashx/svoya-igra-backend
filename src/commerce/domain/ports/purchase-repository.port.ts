import { Purchase } from '../entities';

/**
 * Persistence port for per-room purchase records (plan §15.8). Purchases are
 * immutable facts: `create` is the only write (no update/delete).
 * `existsByRoomAndShopItem` is the cheap availability probe (§14.8: an item is
 * unique across the whole game); the race between two captains is settled by
 * the `purchases_room_id_shop_item_id_uq` index — the loser's `create` throws
 * {@link ItemAlreadyPurchasedError}. The Drizzle adapter lives in
 * infrastructure/persistence.
 */
export interface PurchaseRepositoryPort {
  create(purchase: Purchase): Promise<void>;
  listByRoomId(roomId: string): Promise<Purchase[]>;
  existsByRoomAndShopItem(roomId: string, shopItemId: string): Promise<boolean>;
}

export const PURCHASE_REPOSITORY_PORT = Symbol('PurchaseRepositoryPort');

import { ShopItem } from '../entities';

/**
 * Persistence port for the global shop-item catalog (plan §15.8). Read-only —
 * shop items are seed-managed. The Drizzle adapter lives in
 * infrastructure/persistence.
 */
export interface ShopItemRepositoryPort {
  listAll(): Promise<ShopItem[]>;
  findById(id: string): Promise<ShopItem | null>;
}

export const SHOP_ITEM_REPOSITORY_PORT = Symbol('ShopItemRepositoryPort');

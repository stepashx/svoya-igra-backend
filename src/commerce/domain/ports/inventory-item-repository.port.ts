import { InventoryItem } from '../entities';

/**
 * Persistence port for team inventories (plan §15.9). Inventory entries are
 * immutable facts: `create` is the only write. `listByRoomAndTeam` serves the
 * team's own inventory view; `listByRoomId` serves the host snapshot across
 * all teams. The Drizzle adapter lives in infrastructure/persistence.
 */
export interface InventoryItemRepositoryPort {
  create(item: InventoryItem): Promise<void>;
  listByRoomAndTeam(roomId: string, teamId: string): Promise<InventoryItem[]>;
  listByRoomId(roomId: string): Promise<InventoryItem[]>;
}

export const INVENTORY_ITEM_REPOSITORY_PORT = Symbol(
  'InventoryItemRepositoryPort',
);

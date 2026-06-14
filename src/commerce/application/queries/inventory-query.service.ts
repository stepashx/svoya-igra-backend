import { Inject, Injectable } from '@nestjs/common';
import { InventoryItem, QrTool, ShopItem } from '../../domain/entities';
import {
  INVENTORY_ITEM_REPOSITORY_PORT,
  InventoryItemRepositoryPort,
  QR_TOOL_REPOSITORY_PORT,
  QrToolRepositoryPort,
  SHOP_ITEM_REPOSITORY_PORT,
  ShopItemRepositoryPort,
} from '../../domain/ports';

/** An inventory entry hydrated with its shop item and QR tool (plan §15.9). */
export interface InventoryItemView {
  inventoryItem: InventoryItem;
  shopItem: ShopItem;
  qrTool: QrTool;
}

/**
 * Stateless read model for the team-inventory GET endpoints (plan §15.9) — the
 * {@link ShopQueryService} pattern: pure queries, no mutation, no events, no
 * transaction of its own (transaction-agnostic — the repositories resolve the
 * ambient executor). Returns domain entities/projections; the game-session
 * presentation layer maps them to DTOs.
 *
 * Lives in commerce (which owns the inventory facts and the QR catalog) and is
 * exported from {@link CommerceModule} so the game-session inventory controller
 * can consume it (Design A). The `publicUrl` it surfaces is allowed here — the
 * controller gates these reads to the owning team or the host (§16.5: the QR is
 * never in a room-wide payload, but IS readable by its owners).
 */
@Injectable()
export class InventoryQueryService {
  constructor(
    @Inject(INVENTORY_ITEM_REPOSITORY_PORT)
    private readonly inventory: InventoryItemRepositoryPort,
    @Inject(SHOP_ITEM_REPOSITORY_PORT)
    private readonly shopItems: ShopItemRepositoryPort,
    @Inject(QR_TOOL_REPOSITORY_PORT)
    private readonly qrTools: QrToolRepositoryPort,
  ) {}

  /**
   * A team's inventory entries, each hydrated with its shop item (for the
   * title) and its QR tool (for the consumer-facing fields). The shop catalog
   * and the entries' QR tools are fetched once and indexed in memory.
   */
  async listTeamInventory(
    roomId: string,
    teamId: string,
  ): Promise<InventoryItemView[]> {
    const entries = await this.inventory.listByRoomAndTeam(roomId, teamId);
    if (entries.length === 0) {
      return [];
    }
    const [shopItems, qrTools] = await Promise.all([
      this.shopItems.listAll(),
      this.qrTools.listByIds(entries.map((entry) => entry.qrToolId)),
    ]);
    const shopItemById = new Map(shopItems.map((item) => [item.id, item]));
    const qrToolById = new Map(qrTools.map((tool) => [tool.id, tool]));

    const views: InventoryItemView[] = [];
    for (const entry of entries) {
      const shopItem = shopItemById.get(entry.shopItemId);
      const qrTool = qrToolById.get(entry.qrToolId);
      // Both are FK-restricted seed rows, so this always resolves; an orphan
      // entry would be an impossible state and is skipped rather than surfaced.
      if (shopItem && qrTool) {
        views.push({ inventoryItem: entry, shopItem, qrTool });
      }
    }
    return views;
  }

  /** The QR tools behind a team's inventory entries (publicUrl included). */
  async listTeamQrTools(roomId: string, teamId: string): Promise<QrTool[]> {
    const entries = await this.inventory.listByRoomAndTeam(roomId, teamId);
    if (entries.length === 0) {
      return [];
    }
    return this.qrTools.listByIds(entries.map((entry) => entry.qrToolId));
  }
}

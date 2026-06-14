import { Inject, Injectable } from '@nestjs/common';
import { Purchase, ShopItem } from '../../domain/entities';
import {
  PURCHASE_REPOSITORY_PORT,
  PurchaseRepositoryPort,
  SHOP_ITEM_REPOSITORY_PORT,
  ShopItemRepositoryPort,
} from '../../domain/ports';

/** A catalog item annotated with its per-room availability (§14.8). */
export interface ShopCatalogEntry {
  item: ShopItem;
  available: boolean;
}

/**
 * Stateless read model for the shop GET endpoints (plan §15.8) — the
 * {@link BoardQueryService} pattern: pure queries, no mutation, no events, no
 * transaction of its own. Returns domain entities/projections; the game-session
 * presentation layer maps them to DTOs (and keeps the QR `publicUrl` out of
 * every room-facing payload — never this service's concern, the catalog
 * carries only `qrToolId`).
 *
 * Transaction-agnostic: the repositories resolve their executor from the
 * ambient {@link TransactionContext}, so the SAME service serves both the
 * stand-alone REST reads (no transaction) AND an in-transaction call — the
 * {@link PurchaseItemUseCase} runs `listCatalog` inside its purchase
 * transaction so the snapshot already reflects the just-recorded buy.
 *
 * Lives in commerce (which owns the catalog and the purchase facts) and is
 * exported from {@link CommerceModule} so the game-session shop controller can
 * consume it (Design A: Game Flow owns the SHOP stage and the REST surface,
 * Commerce owns the reads).
 */
@Injectable()
export class ShopQueryService {
  constructor(
    @Inject(SHOP_ITEM_REPOSITORY_PORT)
    private readonly shopItems: ShopItemRepositoryPort,
    @Inject(PURCHASE_REPOSITORY_PORT)
    private readonly purchases: PurchaseRepositoryPort,
  ) {}

  /**
   * The global catalog with per-room availability: an item stays available
   * until ANY team in the room has purchased it (§14.8 unique-per-game).
   */
  async listCatalog(roomId: string): Promise<ShopCatalogEntry[]> {
    const [items, roomPurchases] = await Promise.all([
      this.shopItems.listAll(),
      this.purchases.listByRoomId(roomId),
    ]);
    const purchasedItemIds = new Set(
      roomPurchases.map((purchase) => purchase.shopItemId),
    );
    return items.map((item) => ({
      item,
      available: !purchasedItemIds.has(item.id),
    }));
  }

  /** The room's purchase records (§15.8), newest-or-oldest order left to the DB. */
  listPurchases(roomId: string): Promise<Purchase[]> {
    return this.purchases.listByRoomId(roomId);
  }
}

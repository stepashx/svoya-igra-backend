import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { ShopQueryService } from './application/queries';
import {
  INVENTORY_ITEM_REPOSITORY_PORT,
  PURCHASE_REPOSITORY_PORT,
  QR_TOOL_REPOSITORY_PORT,
  SHOP_ITEM_REPOSITORY_PORT,
} from './domain/ports';
import {
  DrizzleInventoryItemRepository,
  DrizzlePurchaseRepository,
  DrizzleQrToolRepository,
  DrizzleShopItemRepository,
} from './infrastructure/persistence';

/**
 * Commerce feature area. Internal layering: domain / application (read-only
 * queries) / infrastructure — no presentation of its own, the shop REST
 * surface lives in game-session/presentation (Game Flow owns the stages).
 * QrTools lives here as content, not as its own module.
 *
 * Sub-stage 8.1 ships the skeleton (mirroring GameplayModule / Design A): the
 * read models (ShopItem, QrTool) and purchase facts (Purchase, InventoryItem),
 * the four Drizzle repositories, and the exported repository ports the
 * game-session shop/inventory use cases (8.2/8.3) consume. Sub-stage 8.2 adds
 * the first commerce application layer: the read-only {@link ShopQueryService}
 * (catalog + per-room availability), exported for the game-session shop
 * controller. The purchase use cases — captain-only, "first to buy", balance
 * debit via Team.debitBalance — arrive in 8.3. No RealtimeModule import — the
 * `server:commerce:*` events are emitted by the game-session use cases
 * through the RealtimeEventsPort.
 */
@Module({
  imports: [InfrastructureModule],
  providers: [
    // Catalog + purchase persistence ports → Drizzle adapters.
    { provide: SHOP_ITEM_REPOSITORY_PORT, useClass: DrizzleShopItemRepository },
    { provide: QR_TOOL_REPOSITORY_PORT, useClass: DrizzleQrToolRepository },
    { provide: PURCHASE_REPOSITORY_PORT, useClass: DrizzlePurchaseRepository },
    {
      provide: INVENTORY_ITEM_REPOSITORY_PORT,
      useClass: DrizzleInventoryItemRepository,
    },
    // Read model (8.2).
    ShopQueryService,
  ],
  exports: [
    // Consumed by the game-session shop/inventory use cases (Design A).
    SHOP_ITEM_REPOSITORY_PORT,
    QR_TOOL_REPOSITORY_PORT,
    PURCHASE_REPOSITORY_PORT,
    INVENTORY_ITEM_REPOSITORY_PORT,
    ShopQueryService,
  ],
})
export class CommerceModule {}

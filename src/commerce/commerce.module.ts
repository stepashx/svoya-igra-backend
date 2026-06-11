import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
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
 * Commerce feature area. Internal layering: domain / infrastructure (no
 * application or presentation of its own). QrTools lives here as content,
 * not as its own module.
 *
 * Sub-stage 8.1 ships the skeleton (mirroring GameplayModule / Design A): the
 * read models (ShopItem, QrTool) and purchase facts (Purchase, InventoryItem),
 * the four Drizzle repositories, and the exported repository ports the
 * game-session shop/inventory use cases (8.2/8.3) will consume. The shop REST
 * surface lives in game-session/presentation (Game Flow owns the stages); the
 * purchase use cases — captain-only, "first to buy", balance debit via
 * Team.debitBalance — arrive in 8.2/8.3. No RealtimeModule import — the
 * `server:commerce:*` events will be emitted by the game-session use cases
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
  ],
  exports: [
    // Consumed by the game-session shop/inventory use cases (Design A).
    SHOP_ITEM_REPOSITORY_PORT,
    QR_TOOL_REPOSITORY_PORT,
    PURCHASE_REPOSITORY_PORT,
    INVENTORY_ITEM_REPOSITORY_PORT,
  ],
})
export class CommerceModule {}

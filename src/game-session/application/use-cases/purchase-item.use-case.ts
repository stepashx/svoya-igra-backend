import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  ID_GENERATOR_PORT,
  IdGeneratorPort,
} from '../../../core/ports/id-generator.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { ShopQueryService } from '../../../commerce/application/queries';
import {
  InventoryItem,
  Purchase,
  QrTool,
  ShopItem,
} from '../../../commerce/domain/entities';
import {
  ItemAlreadyPurchasedError,
  QrToolNotFoundError,
  ShopItemNotFoundError,
} from '../../../commerce/domain/errors';
import {
  INVENTORY_ITEM_REPOSITORY_PORT,
  InventoryItemRepositoryPort,
  PURCHASE_REPOSITORY_PORT,
  PurchaseRepositoryPort,
  QR_TOOL_REPOSITORY_PORT,
  QrToolRepositoryPort,
  SHOP_ITEM_REPOSITORY_PORT,
  ShopItemRepositoryPort,
} from '../../../commerce/domain/ports';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import {
  InsufficientBalanceError,
  NotTeamCaptainError,
  RoomNotActiveError,
  RoomNotFoundError,
} from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import {
  TEAM_REALTIME_EVENTS_PORT,
  TeamRealtimeEventsPort,
  TRANSACTION_PORT,
  TransactionPort,
} from '../ports';
import { CommerceEvent, GameplayEvent, shopCatalogSummary } from '../events';

export interface PurchaseItemInput {
  roomId: string;
  shopItemId: string;
  actingPlayerId: string;
}

/** The recorded purchase, the inventory entry, its QR tool and the new balance. */
export interface PurchaseItemResult {
  purchase: Purchase;
  inventoryItem: InventoryItem;
  qrTool: QrTool;
  shopItem: ShopItem;
  balance: number;
}

/**
 * A team captain buys a shop item for THEIR OWN team (plan §14.7, §14.8,
 * §15.8). Legal only in SHOP — and for ANY team's captain, not just the active
 * turn-holder's: the receiver is the actor's team (`player.teamId`), so the
 * captain-authz checks team captaincy, not the room's `currentTeamId`
 * ({@link NotTeamCaptainError}). The shop timer is NOT consulted — an EXPIRED
 * window does not block buying; only the stage gate does.
 *
 * "First to buy wins" (§14.8: an item is unique across the whole game) is
 * settled under the per-room advisory lock plus the
 * `purchases_room_id_shop_item_id_uq` index: the `existsByRoomAndShopItem`
 * pre-check rejects most repeats before the debit, and `purchases.create` is
 * the FIRST write so a concurrent loser's insert raises
 * {@link ItemAlreadyPurchasedError} (translated by the adapter). The balance is
 * debited from `balance` only — `earnedScore` (the final result) never shrinks
 * (§14.7).
 *
 * Broadcasts. The four ROOM-wide events fire inside the transaction, in order:
 * `score-changed` (with a NEGATIVE `delta`, the 7.1 contract under a debit),
 * `shop-item-purchased`, `shop-item-unavailable` (the §14.8 delta), and
 * `shop-state-updated` (the whole catalog, availability already reflecting this
 * insert). NONE of them carry the QR `publicUrl` (§16.5 secrecy). The
 * team-audience `inventory-updated` — the ONLY payload allowed to carry
 * `publicUrl` — is emitted AFTER the transaction commits: were it sent inside
 * the transaction and the COMMIT then failed, the team would have received a QR
 * for a rolled-back purchase. Its payload is built from in-memory objects, so
 * it needs no ambient transaction, and the roster fan-out cannot abort the
 * committed purchase (the adapter swallows its own failures).
 */
@Injectable()
export class PurchaseItemUseCase {
  constructor(
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(SHOP_ITEM_REPOSITORY_PORT)
    private readonly shopItems: ShopItemRepositoryPort,
    @Inject(PURCHASE_REPOSITORY_PORT)
    private readonly purchases: PurchaseRepositoryPort,
    @Inject(INVENTORY_ITEM_REPOSITORY_PORT)
    private readonly inventory: InventoryItemRepositoryPort,
    @Inject(QR_TOOL_REPOSITORY_PORT)
    private readonly qrTools: QrToolRepositoryPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(TEAM_REALTIME_EVENTS_PORT)
    private readonly teamRealtime: TeamRealtimeEventsPort,
    private readonly shopQuery: ShopQueryService,
  ) {}

  async execute(input: PurchaseItemInput): Promise<PurchaseItemResult> {
    const committed = await this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      if (room.currentStage !== 'SHOP') {
        throw new UnexpectedGameStageError();
      }

      // Captain-authz on the ACTOR's OWN team (not the active turn-holder): the
      // buyer must be the captain of the team that will receive the item.
      const player = await this.players.findById(input.actingPlayerId);
      if (!player || !player.teamId) {
        throw new NotTeamCaptainError();
      }
      const team = await this.teams.findById(player.teamId);
      if (!team || team.captainPlayerId !== input.actingPlayerId) {
        throw new NotTeamCaptainError();
      }

      const shopItem = await this.shopItems.findById(input.shopItemId);
      if (!shopItem) {
        throw new ShopItemNotFoundError();
      }

      // §14.8 availability pre-check, BEFORE the debit, so a sold item never
      // touches the balance. The create below is still the race arbiter.
      if (await this.purchases.existsByRoomAndShopItem(room.id, shopItem.id)) {
        throw new ItemAlreadyPurchasedError();
      }

      if (!team.canAfford(shopItem.price)) {
        throw new InsufficientBalanceError();
      }
      team.debitBalance(shopItem.price); // in-memory; earnedScore untouched

      const purchase = Purchase.create(
        {
          id: this.ids.generate(),
          roomId: room.id,
          teamId: team.id,
          shopItemId: shopItem.id,
          price: shopItem.price, // snapshot at purchase time
        },
        this.clock.now(),
      );
      // FIRST write — the §14.8 race arbiter (unique index → ItemAlreadyPurchased).
      await this.purchases.create(purchase);

      // Defensive: the shop_items.qr_tool_id FK is RESTRICT and the catalog is
      // 1:1, so a missing tool is an impossible state — fail loudly.
      const qrTool = await this.qrTools.findById(shopItem.qrToolId);
      if (!qrTool) {
        throw new QrToolNotFoundError();
      }

      const inventoryItem = InventoryItem.create(
        {
          id: this.ids.generate(),
          roomId: room.id,
          teamId: team.id,
          shopItemId: shopItem.id,
          qrToolId: qrTool.id,
        },
        this.clock.now(),
      );
      await this.inventory.create(inventoryItem);

      await this.teams.update(team); // persist the debit

      // In-tx so it sees this insert: the bought item already reads unavailable.
      const catalog = await this.shopQuery.listCatalog(room.id);

      // ROOM broadcasts (in order), NONE carrying the QR publicUrl (§16.5).
      this.realtime.emitToRoom(room.id, GameplayEvent.ScoreChanged, {
        roomId: room.id,
        teamId: team.id,
        earnedScore: team.earnedScore.value,
        balance: team.balance.value,
        delta: -shopItem.price,
      });
      this.realtime.emitToRoom(room.id, CommerceEvent.ShopItemPurchased, {
        roomId: room.id,
        teamId: team.id,
        shopItemId: shopItem.id,
        price: purchase.price,
        purchasedAt: purchase.purchasedAt,
      });
      this.realtime.emitToRoom(room.id, CommerceEvent.ShopItemUnavailable, {
        roomId: room.id,
        shopItemId: shopItem.id,
      });
      this.realtime.emitToRoom(room.id, CommerceEvent.ShopStateUpdated, {
        roomId: room.id,
        items: catalog.map(shopCatalogSummary),
      });

      return { purchase, inventoryItem, qrTool, shopItem, team };
    });

    // AFTER commit, team audience only: the ONLY payload that carries publicUrl.
    await this.teamRealtime.emitToTeam(
      committed.team.id,
      CommerceEvent.InventoryUpdated,
      {
        roomId: input.roomId,
        teamId: committed.team.id,
        inventoryItem: {
          id: committed.inventoryItem.id,
          shopItemId: committed.inventoryItem.shopItemId,
          qrToolId: committed.inventoryItem.qrToolId,
          addedAt: committed.inventoryItem.addedAt,
        },
        qrTool: {
          id: committed.qrTool.id,
          title: committed.qrTool.title,
          description: committed.qrTool.description,
          fileFormat: committed.qrTool.fileFormat,
          publicUrl: committed.qrTool.publicUrl,
        },
      },
    );

    return {
      purchase: committed.purchase,
      inventoryItem: committed.inventoryItem,
      qrTool: committed.qrTool,
      shopItem: committed.shopItem,
      balance: committed.team.balance.value,
    };
  }
}

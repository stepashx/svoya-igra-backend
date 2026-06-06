/**
 * Commerce schema group (Stage 5A.3).
 *
 * The global catalogs (`qr_tools`, `shop_items`) plus the per-room/team purchase
 * records (`purchases`, `inventory_items`). This file defines the physical
 * Drizzle tables, their constraints/indexes, and the Drizzle query-API relations
 * only. No commerce behaviour (OpenShop, PurchaseShopItem, balance debit,
 * inventory use cases, …) lives here — that is a later stage.
 *
 * Binding data decisions honoured here (see master context §8 / Stage 5A plan):
 *   - `qr_tools` and `shop_items` are GLOBAL/STATIC catalogs (seeded once,
 *     reused across rooms). NO purchase-state fields on `shop_items`
 *     (`isPurchased`/`purchasedByTeamId`/`purchasedAt` are intentionally absent).
 *   - Purchase state lives in `purchases`, unique per room/item via
 *     `(roomId, shopItemId)` ("first to buy gets it").
 *   - QR `.svg` bytes live in MinIO; the DB holds metadata only. As a global
 *     catalog, `storageKey` carries NO `roomId`.
 *   - A purchase reduces `teams.balance` (owned by Scoring) — that write is NOT
 *     performed here; this group only records the purchase/inventory rows.
 */
import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from '../shared';
import { rooms, teams } from '../game-session';

/**
 * QR-tool content stored as `.svg` in MinIO; the DB holds metadata only. Global
 * catalog referenced by `shop_items` and `inventory_items`. `storageKey` is
 * unique (one object per tool) and carries no `roomId`. Seeded.
 *
 * `fileFormat` is a constant `'svg'` plain-text column rather than the shared
 * `FILE_FORMATS` enum, which is scoped to presentation uploads (pdf/pptx); see
 * the open-questions note in the stage summary.
 */
export const qrTools = pgTable('qr_tools', {
  id: primaryId(),
  title: text('title').notNull(),
  description: text('description'),
  payload: text('payload'),
  fileFormat: text('file_format').notNull().default('svg'),
  storageProvider: text('storage_provider').notNull(),
  bucket: text('bucket').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  publicUrl: text('public_url').notNull(),
  ...timestamps,
});

/**
 * A global, buyable item wrapping a QR tool. Availability is derived from
 * `purchases` — there is no per-row purchase state here. Seeded.
 */
export const shopItems = pgTable('shop_items', {
  id: primaryId(),
  title: text('title').notNull(),
  description: text('description'),
  price: integer('price').notNull(),
  qrToolId: uuid('qr_tool_id')
    .notNull()
    .references(() => qrTools.id),
  ...timestamps,
});

/**
 * A record that a team bought a shop item in a room. `price` is captured at
 * purchase time for a stable record. Unique per room/item ("first to buy gets
 * it"). Runtime-created.
 */
export const purchases = pgTable(
  'purchases',
  {
    id: primaryId(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    shopItemId: uuid('shop_item_id')
      .notNull()
      .references(() => shopItems.id),
    price: integer('price').notNull(),
    purchasedAt: timestamp('purchased_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One purchase per room/shop item — enforces "bought only once per session".
    unique('purchases_room_id_shop_item_id_unique').on(
      table.roomId,
      table.shopItemId,
    ),
    // Per-team purchase reads.
    index('purchases_room_id_team_id_idx').on(table.roomId, table.teamId),
  ],
);

/**
 * A purchased QR tool held in a team's inventory. Unique per team/item (mirrors
 * the one-purchase-per-item rule). Runtime-created.
 */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: primaryId(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    shopItemId: uuid('shop_item_id')
      .notNull()
      .references(() => shopItems.id),
    qrToolId: uuid('qr_tool_id')
      .notNull()
      .references(() => qrTools.id),
    addedAt: timestamp('added_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // No duplicate inventory entry per team for the same item.
    unique('inventory_items_room_id_team_id_shop_item_id_unique').on(
      table.roomId,
      table.teamId,
      table.shopItemId,
    ),
    // Per-team inventory reads.
    index('inventory_items_room_id_team_id_idx').on(table.roomId, table.teamId),
  ],
);

/**
 * Relations for the Drizzle query API.
 */
export const qrToolsRelations = relations(qrTools, ({ many }) => ({
  shopItems: many(shopItems),
  inventoryItems: many(inventoryItems),
}));

export const shopItemsRelations = relations(shopItems, ({ one, many }) => ({
  qrTool: one(qrTools, {
    fields: [shopItems.qrToolId],
    references: [qrTools.id],
  }),
  purchases: many(purchases),
  inventoryItems: many(inventoryItems),
}));

export const purchasesRelations = relations(purchases, ({ one }) => ({
  room: one(rooms, {
    fields: [purchases.roomId],
    references: [rooms.id],
  }),
  team: one(teams, {
    fields: [purchases.teamId],
    references: [teams.id],
  }),
  shopItem: one(shopItems, {
    fields: [purchases.shopItemId],
    references: [shopItems.id],
  }),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({ one }) => ({
  room: one(rooms, {
    fields: [inventoryItems.roomId],
    references: [rooms.id],
  }),
  team: one(teams, {
    fields: [inventoryItems.teamId],
    references: [teams.id],
  }),
  shopItem: one(shopItems, {
    fields: [inventoryItems.shopItemId],
    references: [shopItems.id],
  }),
  qrTool: one(qrTools, {
    fields: [inventoryItems.qrToolId],
    references: [qrTools.id],
  }),
}));

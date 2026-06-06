/**
 * Commerce schema group (Stage 5A.3).
 *
 * The in-game economy tables: the seeded `qr_tools` and `shop_items` catalogs
 * and the per-room `purchases` and `inventory_items`. This file defines the
 * physical Drizzle tables, their constraints/indexes, and the Drizzle query-API
 * relations only. No commerce behaviour (shop opening, "first to buy" purchase,
 * balance debit, inventory display, …) lives here — those are later feature
 * stages.
 *
 * Binding data decisions honoured here (see master context §8/§10 / Stage 5A
 * plan §7):
 *   - `qr_tools` and `shop_items` are global/static seeded catalogs. There are
 *     NO purchase-state fields (`isPurchased`/`purchasedByTeamId`/`purchasedAt`)
 *     on `shop_items` — availability is derived from `purchases`.
 *   - `qr_tools` stores ONLY MinIO file metadata; the `.svg` bytes live in MinIO
 *     (no `files` table). Its `storageKey` is global (`qr-tools/<id|slug>.svg`)
 *     and carries no `roomId`; it is unique (one object per tool).
 *   - Per-room purchase state lives in `purchases` with `(roomId, shopItemId)`
 *     uniqueness ("first to buy gets it"); `inventory_items` is the per-team
 *     record with `(roomId, teamId, shopItemId)` uniqueness. Both are runtime-
 *     created. `purchases.price` is captured at purchase time for a stable
 *     record. A purchase also reduces `teams.balance`, but that write is owned by
 *     Scoring (Gameplay), not here.
 *
 * QR tools use the fixed `svg` format; the presentation FILE_FORMATS vocabulary
 * is for uploads, not QR assets, so it is intentionally not reused here.
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
 * QR-tool content stored as `.svg` in MinIO; the DB holds metadata only. Global,
 * static, seeded catalog. `storageKey` is the durable handle and is unique;
 * `fileFormat` is fixed to `svg`.
 */
export const qrTools = pgTable(
  'qr_tools',
  {
    id: primaryId(),
    title: text('title').notNull(),
    description: text('description'),
    payload: text('payload'),
    fileFormat: text('file_format').notNull().default('svg'),
    storageProvider: text('storage_provider').notNull(),
    bucket: text('bucket').notNull(),
    storageKey: text('storage_key').notNull(),
    publicUrl: text('public_url').notNull(),
    ...timestamps,
  },
  (table) => [
    // One MinIO object per tool — the global storage key is unique.
    unique('qr_tools_storage_key_unique').on(table.storageKey),
  ],
);

/**
 * A global, buyable item wrapping a QR tool. Seeded catalog with a whole-number
 * `price`. No purchase-state fields — availability is derived from `purchases`.
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
 * A record that a team bought a shop item in a room. Runtime-created. `price` is
 * captured at purchase time. One purchase per room/shop item ("first to buy").
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
    ...timestamps,
  },
  (table) => [
    // One purchase per room/shop item — enforces "bought only once per session".
    unique('purchases_room_id_shop_item_id_unique').on(
      table.roomId,
      table.shopItemId,
    ),
    // Per-team purchase reads are the common lookup path.
    index('purchases_room_id_team_id_idx').on(table.roomId, table.teamId),
  ],
);

/**
 * A purchased QR tool held in a team's inventory. Runtime-created. No duplicate
 * inventory entry for the same item per team. Usage status is not tracked in MVP.
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
    ...timestamps,
  },
  (table) => [
    // No duplicate inventory entry for the same item per team.
    unique('inventory_items_room_id_team_id_shop_item_id_unique').on(
      table.roomId,
      table.teamId,
      table.shopItemId,
    ),
    // Per-team inventory reads are the common lookup path.
    index('inventory_items_room_id_team_id_idx').on(table.roomId, table.teamId),
  ],
);

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

/**
 * Relations for the Drizzle query API. Only the FK-holding side is declared for
 * references into game-session (rooms/teams) so the accepted game-session
 * relations stay untouched.
 */
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

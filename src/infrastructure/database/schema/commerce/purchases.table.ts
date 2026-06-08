import { integer, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idPk } from '../_shared/columns';
import { rooms } from '../game-session/rooms.table';
import { teams } from '../game-session/teams.table';
import { shopItems } from './shop-items.table';

/**
 * A completed purchase (plan §12) — the per-room record that makes a global
 * shop item "bought" in this game. Owned by the room and the buying team
 * (cascade); the shop item is a seed reference (`restrict`).
 *
 * `purchases_room_id_shop_item_id_uq` enforces "one purchase of an item per
 * game" (§14.8: an item is unique across the whole game). `purchased_at` is a
 * §12 `*At` field, so it defaults to `now()`.
 */
export const purchases = pgTable(
  'purchases',
  {
    id: idPk(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    shopItemId: uuid('shop_item_id')
      .notNull()
      .references(() => shopItems.id, { onDelete: 'restrict' }),
    price: integer('price').notNull(),
    purchasedAt: createdAt('purchased_at'),
  },
  (table) => [
    uniqueIndex('purchases_room_id_shop_item_id_uq').on(
      table.roomId,
      table.shopItemId,
    ),
  ],
);

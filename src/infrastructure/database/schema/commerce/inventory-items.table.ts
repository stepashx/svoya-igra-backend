import { pgTable, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idPk } from '../_shared/columns';
import { rooms } from '../game-session/rooms.table';
import { teams } from '../game-session/teams.table';
import { qrTools } from './qr-tools.table';
import { shopItems } from './shop-items.table';

/**
 * An inventory entry (plan §12) — a QR tool a team owns after buying its shop
 * item. Owned by the room and team (cascade); the shop item and QR tool are
 * seed references (`restrict`). `added_at` is a §12 `*At` field → `now()`.
 */
export const inventoryItems = pgTable('inventory_items', {
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
  qrToolId: uuid('qr_tool_id')
    .notNull()
    .references(() => qrTools.id, { onDelete: 'restrict' }),
  addedAt: createdAt('added_at'),
});

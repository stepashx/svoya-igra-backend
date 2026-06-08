import { integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idPk } from '../_shared/columns';
import { qrTools } from './qr-tools.table';

/**
 * A shop item (plan §12). Authorized deviation from §12: items are a GLOBAL
 * reusable catalog — no `isPurchased` / `purchasedByTeamId` / `purchasedAt`
 * here. Per-room, per-game purchase state lives in the `purchases` table.
 *
 * Each item exposes exactly one QR tool (`qr_tool_id`, unique, `restrict`).
 */
export const shopItems = pgTable(
  'shop_items',
  {
    id: idPk(),
    title: text('title').notNull(),
    description: text('description'),
    price: integer('price').notNull(),
    qrToolId: uuid('qr_tool_id')
      .notNull()
      .references(() => qrTools.id, { onDelete: 'restrict' }),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('shop_items_qr_tool_id_uq').on(table.qrToolId)],
);

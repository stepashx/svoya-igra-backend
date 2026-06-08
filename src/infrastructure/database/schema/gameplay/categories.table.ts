import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { idPk } from '../_shared/columns';

/**
 * A board category (plan §12) — 6 of them, seeded. Global catalog shared by all
 * rooms; per-room cells reference it from `board_cells.category_id`. No
 * `created_at` (§12 defines none) and no unique on `position` (kept minimal per
 * §19 — the seed owns ordering).
 */
export const categories = pgTable('categories', {
  id: idPk(),
  title: text('title').notNull(),
  position: integer('position').notNull(),
});

import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { idPk } from '../_shared/columns';

/**
 * A presentation requirement/condition shown during preparation (plan §12).
 * Global seeded catalog. `order` maps to the reserved word `order`; Drizzle
 * quotes the column and the TS key `order` is fine. `is_required` defaults to
 * `true` (a "requirement" is required unless a seed marks it optional). No
 * `created_at` — §12 defines none for this catalog entity.
 */
export const presentationRequirements = pgTable('presentation_requirements', {
  id: idPk(),
  title: text('title').notNull(),
  description: text('description'),
  order: integer('order').notNull(),
  isRequired: boolean('is_required').notNull().default(true),
});

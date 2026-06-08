import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { idPk } from '../_shared/columns';

/**
 * A seeded evaluation criterion (plan §12) — in MVP "topic disclosure" (0–10)
 * and "presentation design" (0–10). Global catalog. `order` maps to the
 * reserved word `order` (Drizzle quotes it). No `created_at` — §12 defines none.
 */
export const evaluationCriteria = pgTable('evaluation_criteria', {
  id: idPk(),
  title: text('title').notNull(),
  description: text('description'),
  minScore: integer('min_score').notNull(),
  maxScore: integer('max_score').notNull(),
  order: integer('order').notNull(),
});

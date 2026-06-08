import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idPk } from '../_shared/columns';
import { categories } from './categories.table';

/**
 * A seeded question (plan §12) — 30 in total, with the correct answer held on
 * the backend (`correct_answer`, NOT NULL) and only revealed to the host after
 * a team answers. `category_id` is `restrict`: a seed category must not be
 * deleted while questions reference it.
 *
 * `text` maps to the reserved word `text`; Drizzle quotes the column, and the
 * TS key `text` is fine. No unique on (category, position) — kept minimal (§19).
 */
export const questions = pgTable('questions', {
  id: idPk(),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  text: text('text').notNull(),
  correctAnswer: text('correct_answer').notNull(),
  points: integer('points').notNull(),
  position: integer('position').notNull(),
  createdAt: createdAt(),
});

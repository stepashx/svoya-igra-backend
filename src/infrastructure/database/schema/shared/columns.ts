import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Reusable column conventions shared by every table. Centralising them keeps
 * id and timestamp semantics identical across feature areas without a base-class
 * abstraction. Future table definitions spread/compose these helpers, e.g.:
 *
 *   export const rooms = pgTable('rooms', {
 *     id: primaryId(),
 *     ...timestamps,
 *   });
 *
 * Tables are not defined in this sub-stage (5A.1); these helpers exist so the
 * later table work is consistent from the first file.
 */

/** Primary key: a database-generated UUID. */
export const primaryId = () => uuid('id').primaryKey().defaultRandom();

/**
 * Standard audit timestamps. `createdAt` is set on insert; `updatedAt` defaults
 * on insert and is bumped by application/repository code on update. Both are
 * stored with time zone to avoid ambiguity.
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
};

import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Small column builders shared by every table so the conventions fixed for
 * Stage 4 live in one place:
 *   - primary keys are server-generated UUIDs (`gen_random_uuid()`, built into
 *     PostgreSQL 16 — no pgcrypto extension required);
 *   - every timestamp is `timestamptz` (UTC-aware);
 *   - creation stamps default to `now()`.
 *
 * These are infrastructure-only helpers — they never leak past the schema.
 */

/** Primary key column: `uuid id PRIMARY KEY DEFAULT gen_random_uuid()`. */
export function idPk() {
  return uuid('id').primaryKey().defaultRandom();
}

/** A `timestamptz` column (nullable until `.notNull()` is chained). */
export function tsTz(name: string) {
  return timestamp(name, { withTimezone: true });
}

/**
 * A required creation timestamp (`timestamptz NOT NULL DEFAULT now()`). Use
 * only for fields that exist in plan §12 (e.g. `created_at`, `joined_at`,
 * `uploaded_at`); never invent one. Event timestamps that fire later
 * (`finished_at`, `blocked_at`, `confirmed_at`) are plain `tsTz` instead.
 */
export function createdAt(name = 'created_at') {
  return tsTz(name).notNull().defaultNow();
}

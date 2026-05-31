import { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Drizzle client type for this app. The schema parameter is empty until
 * Stage 5A introduces table definitions; widen it there as tables are added.
 * Kept inside infrastructure — Drizzle types never leak to domain/application.
 */
export type DrizzleDatabase = NodePgDatabase<Record<string, never>>;

/** The transaction handle Drizzle passes to a `transaction()` callback. */
export type DrizzleTransaction = Parameters<
  Parameters<DrizzleDatabase['transaction']>[0]
>[0];

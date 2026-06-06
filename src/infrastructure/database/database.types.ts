import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * Drizzle client type for this app, parameterised by the schema barrel so the
 * client (and `db.query`) stay in sync as tables are added in later sub-stages.
 * The barrel currently exports only shared enums/conventions, so no tables are
 * registered yet (Stage 5A.1). Kept inside infrastructure — Drizzle types never
 * leak to domain/application.
 */
export type DrizzleDatabase = NodePgDatabase<typeof schema>;

/** The transaction handle Drizzle passes to a `transaction()` callback. */
export type DrizzleTransaction = Parameters<
  Parameters<DrizzleDatabase['transaction']>[0]
>[0];

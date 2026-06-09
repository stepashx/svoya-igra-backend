import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

/**
 * Drizzle client type for this app, parameterized by the full schema (Stage 4)
 * so query builders are table-aware. Kept inside infrastructure — Drizzle types
 * never leak to domain/application.
 */
export type DrizzleDatabase = NodePgDatabase<typeof schema>;

/** The transaction handle Drizzle passes to a `transaction()` callback. */
export type DrizzleTransaction = Parameters<
  Parameters<DrizzleDatabase['transaction']>[0]
>[0];

/**
 * Either query executor a repository may run on: the pooled Drizzle client or
 * an ambient transaction. Repositories resolve one of these per call so the
 * same query code participates in a transaction when one is active.
 */
export type DbExecutor = DrizzleDatabase | DrizzleTransaction;

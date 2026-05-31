/** DI token for the raw PostgreSQL connection pool (node-postgres). */
export const DATABASE_POOL = Symbol('DATABASE_POOL');

/** DI token for the Drizzle client built on top of the connection pool. */
export const DRIZZLE = Symbol('DRIZZLE');

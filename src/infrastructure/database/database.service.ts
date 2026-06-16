import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL, DRIZZLE } from './database.constants';
import { DrizzleDatabase, DrizzleTransaction } from './database.types';

/**
 * Infrastructure entry point for PostgreSQL access. Exposes the Drizzle
 * client, a transaction seam for future application use cases, and a
 * lightweight connectivity probe for the Health module. Owns the pool
 * lifecycle and closes it on shutdown. Holds no business logic.
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    @Inject(DRIZZLE) private readonly drizzle: DrizzleDatabase,
  ) {}

  /** The Drizzle client. Repository adapters build queries on this. */
  get db(): DrizzleDatabase {
    return this.drizzle;
  }

  /**
   * Run work atomically. Application use cases that touch multiple tables
   * (e.g. answer review, purchase) wrap their writes here in later stages.
   */
  transaction<T>(work: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
    return this.drizzle.transaction(work);
  }

  /** Lightweight reachability probe used by the Health module. */
  async checkConnection(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

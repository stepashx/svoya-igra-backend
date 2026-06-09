import { Module } from '@nestjs/common';
import { databaseProviders } from './database.providers';
import { DatabaseService } from './database.service';
import { TransactionContext } from './transaction-context';

/**
 * Database subsystem: PostgreSQL connection pool, Drizzle client seam, a
 * transaction seam, the ambient {@link TransactionContext}, and a connectivity
 * probe. The single TransactionContext singleton is shared by the transaction
 * adapter (which sets the ambient tx) and the repositories (which read it).
 */
@Module({
  providers: [...databaseProviders, DatabaseService, TransactionContext],
  exports: [DatabaseService, TransactionContext],
})
export class DatabaseModule {}

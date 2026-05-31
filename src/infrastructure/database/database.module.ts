import { Module } from '@nestjs/common';
import { databaseProviders } from './database.providers';
import { DatabaseService } from './database.service';

/**
 * Database subsystem: PostgreSQL connection pool, Drizzle client seam, a
 * transaction seam, and a connectivity probe. Schema, migrations, seeds, and
 * repository adapters arrive in Stage 5A.
 */
@Module({
  providers: [...databaseProviders, DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}

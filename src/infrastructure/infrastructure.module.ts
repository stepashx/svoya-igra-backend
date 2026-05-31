import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { StorageModule } from './storage/storage.module';
import { TechnicalAdaptersModule } from './technical-adapters/technical-adapters.module';

/**
 * Aggregates the low-level technical subsystems behind ports: database and
 * storage seams plus the shared technical adapters (clock, token generator).
 */
@Module({
  imports: [DatabaseModule, StorageModule, TechnicalAdaptersModule],
  exports: [DatabaseModule, StorageModule, TechnicalAdaptersModule],
})
export class InfrastructureModule {}

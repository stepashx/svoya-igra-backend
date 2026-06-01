import { Module } from '@nestjs/common';
import { storageProviders } from './storage.providers';
import { StorageService } from './storage.service';

/**
 * Storage subsystem: S3-compatible (MinIO) client seam, public-URL / key
 * conventions, and a read-only reachability probe. Upload behavior arrives
 * with the feature stages.
 */
@Module({
  providers: [...storageProviders, StorageService],
  exports: [StorageService],
})
export class StorageModule {}

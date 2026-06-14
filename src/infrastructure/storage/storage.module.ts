import { Module } from '@nestjs/common';
import { FILE_STORAGE_PORT } from '../../core/ports';
import { storageProviders } from './storage.providers';
import { StorageService } from './storage.service';

/**
 * Storage subsystem: S3-compatible (MinIO) client seam, public-URL / key
 * conventions, a read-only reachability probe, and the {@link FileStoragePort}
 * write seam (Stage 9) bound to the same {@link StorageService}. The port token
 * is re-exported transitively by InfrastructureModule, so 9.3's upload use case
 * injects it without importing StorageModule directly.
 */
@Module({
  providers: [
    ...storageProviders,
    StorageService,
    { provide: FILE_STORAGE_PORT, useExisting: StorageService },
  ],
  exports: [StorageService, FILE_STORAGE_PORT],
})
export class StorageModule {}

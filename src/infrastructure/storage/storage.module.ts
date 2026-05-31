import { Module } from '@nestjs/common';

/**
 * Storage subsystem shell (Stage 3A placeholder).
 *
 * Reserved location for the MinIO/S3 client, bucket/key/publicUrl helpers,
 * and the storage health probe. No client wiring or upload behavior is
 * implemented yet — those arrive in Stage 3B.
 */
@Module({})
export class StorageModule {}

import { Inject, Injectable } from '@nestjs/common';
import { Client } from 'minio';
import {
  FileStoragePort,
  PutPresentationParams,
  StoredFileLocator,
} from '../../core/ports';
import { AppConfigService } from '../../config/app-config.service';
import { STORAGE_CLIENT } from './storage.constants';
import { buildPublicUrl, presentationStorageKey } from './storage-key.helper';

/**
 * Infrastructure entry point for the S3-compatible (MinIO) store. Exposes
 * public-URL construction, a read-only reachability probe for Health, and the
 * first object write — {@link putPresentation}, the {@link FileStoragePort}
 * implementation that persists an uploaded presentation file (Stage 9). The
 * write path is exactly that one method; everything else stays read-only.
 */
@Injectable()
export class StorageService implements FileStoragePort {
  constructor(
    @Inject(STORAGE_CLIENT) private readonly client: Client,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Persist one uploaded presentation file under its room/team-scoped key and
   * return the durable locator the upload use case stores on the submission
   * row. Public bucket (MVP), so the returned `publicUrl` is room-readable.
   */
  async putPresentation(
    params: PutPresentationParams,
  ): Promise<StoredFileLocator> {
    const bucket = this.config.storage.bucket;
    const storageKey = presentationStorageKey({
      roomId: params.roomId,
      teamId: params.teamId,
      submissionId: params.submissionId,
      extension: params.extension,
    });
    await this.client.putObject(bucket, storageKey, params.body, params.size, {
      'Content-Type': params.contentType,
    });
    return {
      storageProvider: 'minio',
      bucket,
      storageKey,
      publicUrl: this.buildPublicUrl(storageKey),
    };
  }

  /** Direct link the frontend opens for a stored object (public bucket, MVP). */
  buildPublicUrl(storageKey: string): string {
    const storage = this.config.storage;
    return buildPublicUrl({
      publicBaseUrl: storage.publicUrl,
      bucket: storage.bucket,
      storageKey,
      pathStyle: storage.pathStyle,
    });
  }

  /**
   * Read-only reachability probe: confirms MinIO is reachable and the
   * configured bucket exists. Throws a clear reason otherwise. Never creates
   * the bucket — provisioning is a deploy/seed concern (Stage 5A).
   */
  async checkConnection(): Promise<void> {
    const bucket = this.config.storage.bucket;
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      throw new Error(`MinIO bucket "${bucket}" does not exist`);
    }
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { Client } from 'minio';
import { AppConfigService } from '../../config/app-config.service';
import { STORAGE_CLIENT } from './storage.constants';
import { buildPublicUrl } from './storage-key.helper';

/**
 * Infrastructure entry point for the S3-compatible (MinIO) store. Exposes
 * public-URL construction and a read-only reachability probe for Health.
 * Actual upload/retrieval behavior arrives with the feature stages; this seam
 * never writes objects.
 */
@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_CLIENT) private readonly client: Client,
    private readonly config: AppConfigService,
  ) {}

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

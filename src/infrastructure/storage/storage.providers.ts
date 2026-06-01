import { Provider } from '@nestjs/common';
import { Client } from 'minio';
import { AppConfigService } from '../../config/app-config.service';
import { STORAGE_CLIENT } from './storage.constants';

/**
 * Connection seam for the S3-compatible (MinIO) store. Constructing the client
 * does no network I/O; reachability is verified by the storage health probe.
 */
export const storageProviders: Provider[] = [
  {
    provide: STORAGE_CLIENT,
    inject: [AppConfigService],
    useFactory: (config: AppConfigService): Client => {
      const storage = config.storage;
      return new Client({
        endPoint: storage.endpoint,
        port: storage.port,
        useSSL: storage.useSsl,
        accessKey: storage.accessKey,
        secretKey: storage.secretKey,
        pathStyle: storage.pathStyle,
      });
    },
  },
];

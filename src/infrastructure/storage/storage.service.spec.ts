import { Client } from 'minio';
import { AppConfigService } from '../../config/app-config.service';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  const storageConfig = {
    endpoint: 'localhost',
    port: 9000,
    accessKey: 'key',
    secretKey: 'secret',
    bucket: 'svoya-igra',
    publicUrl: 'http://localhost:9000',
    useSsl: false,
    pathStyle: true,
  };

  const makeService = (bucketExists: () => Promise<boolean>) => {
    const client = { bucketExists } as unknown as Client;
    const config = { storage: storageConfig } as unknown as AppConfigService;
    return new StorageService(client, config);
  };

  it('builds a public URL from config and a storage key', () => {
    const service = makeService(() => Promise.resolve(true));
    expect(service.buildPublicUrl('qr-tools/tool-1.svg')).toBe(
      'http://localhost:9000/svoya-igra/qr-tools/tool-1.svg',
    );
  });

  it('resolves checkConnection when the bucket exists', async () => {
    const service = makeService(() => Promise.resolve(true));
    await expect(service.checkConnection()).resolves.toBeUndefined();
  });

  it('throws a clear reason when the bucket is missing', async () => {
    const service = makeService(() => Promise.resolve(false));
    await expect(service.checkConnection()).rejects.toThrow(
      /bucket "svoya-igra" does not exist/,
    );
  });
});

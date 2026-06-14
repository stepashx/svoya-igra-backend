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

  /** A client whose `putObject` is a recorder (mirrors the bucket-provisioning spec). */
  const makeWriteService = () => {
    const putObject = jest
      .fn()
      .mockResolvedValue({ etag: 'x', versionId: null });
    const client = { putObject } as unknown as Client;
    const config = { storage: storageConfig } as unknown as AppConfigService;
    return { service: new StorageService(client, config), putObject };
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

  describe('putPresentation', () => {
    const body = Buffer.from('%PDF-1.4 fake', 'utf8');

    it('puts the bytes under the room/team-scoped key and returns the locator', async () => {
      const { service, putObject } = makeWriteService();

      const locator = await service.putPresentation({
        roomId: 'room-1',
        teamId: 'team-1',
        submissionId: 'sub-1',
        extension: 'pdf',
        body,
        size: body.length,
        contentType: 'application/pdf',
      });

      const expectedKey = 'rooms/room-1/presentations/team-1/sub-1.pdf';
      expect(putObject).toHaveBeenCalledTimes(1);
      expect(putObject).toHaveBeenCalledWith(
        'svoya-igra',
        expectedKey,
        body,
        body.length,
        { 'Content-Type': 'application/pdf' },
      );
      expect(locator).toEqual({
        storageProvider: 'minio',
        bucket: 'svoya-igra',
        storageKey: expectedKey,
        publicUrl: `http://localhost:9000/svoya-igra/${expectedKey}`,
      });
    });
  });
});

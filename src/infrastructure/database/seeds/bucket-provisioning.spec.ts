import { Client } from 'minio';
import {
  buildPublicReadPolicy,
  ensureBucketExists,
  provisionBucket,
  uploadQrToolSvg,
} from './bucket-provisioning';

type MockClient = {
  bucketExists: jest.Mock;
  makeBucket: jest.Mock;
  setBucketPolicy: jest.Mock;
  putObject: jest.Mock;
};

const makeClient = (exists: boolean): MockClient => ({
  bucketExists: jest.fn().mockResolvedValue(exists),
  makeBucket: jest.fn().mockResolvedValue(undefined),
  setBucketPolicy: jest.fn().mockResolvedValue(undefined),
  putObject: jest.fn().mockResolvedValue({ etag: 'x', versionId: null }),
});

const asClient = (mock: MockClient) => mock as unknown as Client;

describe('buildPublicReadPolicy', () => {
  it('allows anonymous GetObject scoped to the bucket', () => {
    const policy = JSON.parse(buildPublicReadPolicy('svoya-igra'));
    expect(policy.Statement[0].Action).toContain('s3:GetObject');
    expect(policy.Statement[0].Effect).toBe('Allow');
    expect(policy.Statement[0].Resource).toEqual(['arn:aws:s3:::svoya-igra/*']);
  });
});

describe('ensureBucketExists', () => {
  it('does not create the bucket when it already exists', async () => {
    const client = makeClient(true);
    const result = await ensureBucketExists(asClient(client), 'svoya-igra');
    expect(client.makeBucket).not.toHaveBeenCalled();
    expect(result).toEqual({ created: false });
  });

  it('creates the bucket when it is missing', async () => {
    const client = makeClient(false);
    const result = await ensureBucketExists(asClient(client), 'svoya-igra');
    expect(client.makeBucket).toHaveBeenCalledTimes(1);
    expect(client.makeBucket).toHaveBeenCalledWith('svoya-igra');
    expect(result).toEqual({ created: true });
  });
});

describe('provisionBucket', () => {
  it('applies the public-read policy and skips creation for an existing bucket', async () => {
    const client = makeClient(true);
    const result = await provisionBucket(asClient(client), 'svoya-igra');
    expect(client.makeBucket).not.toHaveBeenCalled();
    expect(client.setBucketPolicy).toHaveBeenCalledWith(
      'svoya-igra',
      buildPublicReadPolicy('svoya-igra'),
    );
    expect(result).toEqual({ created: false });
  });
});

describe('uploadQrToolSvg', () => {
  it('puts the SVG bytes under the storage key with an SVG content type', async () => {
    const client = makeClient(true);
    await uploadQrToolSvg(asClient(client), {
      bucket: 'svoya-igra',
      storageKey: 'qr-tools/tool-1.svg',
      svg: '<svg></svg>',
    });

    expect(client.putObject).toHaveBeenCalledTimes(1);
    const [bucket, key, body, size, meta] = client.putObject.mock.calls[0];
    expect(bucket).toBe('svoya-igra');
    expect(key).toBe('qr-tools/tool-1.svg');
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(size).toBe(Buffer.byteLength('<svg></svg>'));
    expect(meta).toEqual({ 'Content-Type': 'image/svg+xml' });
  });
});

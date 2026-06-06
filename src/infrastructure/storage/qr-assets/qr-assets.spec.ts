/**
 * Procedure-level checks for QR placement/verification (Stage 5A.7), exercised
 * against in-memory fakes for MinIO and Drizzle so they run in `npm test` with no
 * live infrastructure. They cover the contract the CLIs depend on: placement
 * uploads one SVG-typed object per seeded tool, and verification passes on a
 * consistent, fully-backed catalog but fails clearly on a missing object or
 * drifted metadata. End-to-end checks against a real MinIO/DB are run via
 * `npm run db:seed:qr-assets` + `npm run db:verify:qr-assets`.
 */
import { Client } from 'minio';
import { buildPublicUrl, qrToolStorageKey } from '../storage-key.helper';
import {
  QrStorageDescriptor,
  ensurePublicBucket,
  placeQrAssets,
  verifyQrAssets,
} from './qr-assets';
import type { DrizzleDatabase } from '../../database/database.types';
import { QR_TOOL_SEEDS } from '../../database/seeds/required-seed-data';

const STORAGE: QrStorageDescriptor = {
  storageProvider: 'minio',
  bucket: 'svoya-igra',
  publicBaseUrl: 'http://localhost:9000',
  pathStyle: true,
};

/** Minimal in-memory stand-in for the parts of the MinIO client used here. */
class FakeMinio {
  readonly buckets = new Set<string>();
  readonly objects = new Map<string, { body: Buffer; contentType?: string }>();

  bucketExists(bucket: string): Promise<boolean> {
    return Promise.resolve(this.buckets.has(bucket));
  }
  makeBucket(bucket: string): Promise<void> {
    this.buckets.add(bucket);
    return Promise.resolve();
  }
  setBucketPolicy(): Promise<void> {
    return Promise.resolve();
  }
  putObject(
    bucket: string,
    key: string,
    body: Buffer,
    _size: number,
    meta?: Record<string, string>,
  ): Promise<{ etag: string }> {
    this.objects.set(`${bucket}/${key}`, {
      body,
      contentType: meta?.['Content-Type'],
    });
    return Promise.resolve({ etag: 'fake-etag' });
  }
  statObject(
    bucket: string,
    key: string,
  ): Promise<{ metaData: Record<string, string | undefined> }> {
    const object = this.objects.get(`${bucket}/${key}`);
    if (!object) {
      return Promise.reject(
        Object.assign(new Error('Not Found'), { code: 'NotFound' }),
      );
    }
    // Real MinIO reports the header lowercased as `content-type`.
    return Promise.resolve({
      metaData: { 'content-type': object.contentType },
    });
  }
}

/** The `qr_tools` rows the seed runner would write for the given config. */
function seededRows(storage: QrStorageDescriptor) {
  return QR_TOOL_SEEDS.map((tool) => {
    const storageKey = qrToolStorageKey(tool.id);
    return {
      id: tool.id,
      title: tool.title,
      description: tool.description,
      payload: tool.payload,
      fileFormat: 'svg',
      storageProvider: storage.storageProvider,
      bucket: storage.bucket,
      storageKey,
      publicUrl: buildPublicUrl({
        publicBaseUrl: storage.publicBaseUrl,
        bucket: storage.bucket,
        storageKey,
        pathStyle: storage.pathStyle,
      }),
    };
  });
}

/** Drizzle stand-in whose `select().from()` resolves to fixed rows. */
function fakeDb(rows: ReturnType<typeof seededRows>): DrizzleDatabase {
  return {
    select: () => ({ from: () => Promise.resolve(rows) }),
  } as unknown as DrizzleDatabase;
}

describe('QR asset placement', () => {
  it('creates the bucket on first run and reports it idempotently', async () => {
    const minio = new FakeMinio();
    const client = minio as unknown as Client;

    expect(await ensurePublicBucket(client, STORAGE.bucket)).toEqual({
      created: true,
    });
    expect(await ensurePublicBucket(client, STORAGE.bucket)).toEqual({
      created: false,
    });
  });

  it('uploads one SVG-typed object per seeded tool under its global key', async () => {
    const minio = new FakeMinio();
    const placed = await placeQrAssets(
      minio as unknown as Client,
      STORAGE.bucket,
    );

    expect(placed).toHaveLength(QR_TOOL_SEEDS.length);
    for (const tool of QR_TOOL_SEEDS) {
      const key = `${STORAGE.bucket}/${qrToolStorageKey(tool.id)}`;
      const object = minio.objects.get(key);
      expect(object).toBeDefined();
      expect(object?.contentType).toBe('image/svg+xml');
      expect(object?.body.length).toBeGreaterThan(0);
    }
  });
});

describe('QR asset verification', () => {
  it('passes when metadata is consistent and every object is present', async () => {
    const minio = new FakeMinio();
    await placeQrAssets(minio as unknown as Client, STORAGE.bucket);

    const result = await verifyQrAssets({
      client: minio as unknown as Client,
      db: fakeDb(seededRows(STORAGE)),
      storage: STORAGE,
    });
    expect(result.checked).toBe(QR_TOOL_SEEDS.length);
  });

  it('fails clearly when an object is missing from MinIO', async () => {
    const minio = new FakeMinio(); // nothing placed
    await expect(
      verifyQrAssets({
        client: minio as unknown as Client,
        db: fakeDb(seededRows(STORAGE)),
        storage: STORAGE,
      }),
    ).rejects.toThrow(/object missing in MinIO/);
  });

  it('fails when seeded metadata is inconsistent with config', async () => {
    const minio = new FakeMinio();
    await placeQrAssets(minio as unknown as Client, STORAGE.bucket);

    const drifted = seededRows(STORAGE);
    drifted[0].bucket = 'wrong-bucket';

    await expect(
      verifyQrAssets({
        client: minio as unknown as Client,
        db: fakeDb(drifted),
        storage: STORAGE,
      }),
    ).rejects.toThrow(/bucket "wrong-bucket" != config/);
  });
});

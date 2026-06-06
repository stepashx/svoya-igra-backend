/**
 * QR / MinIO placement procedure (Stage 5A.7).
 *
 * Owns the object-store side of the QR catalog: it provisions the public bucket,
 * uploads the seeded QR `.svg` objects under their global storage keys, and
 * verifies that the seeded `qr_tools` metadata is internally consistent with
 * config and actually backed by objects in MinIO.
 *
 * This is Infrastructure tooling: it receives an already-built MinIO `Client`
 * and Drizzle handle from the thin CLI entrypoints (`place-qr-assets.ts` /
 * `verify-qr-assets.ts`), holds no feature behaviour, and is never imported by
 * the domain/application layers. It deliberately does NOT implement presentation
 * uploads, shop/purchase behaviour, signed URLs, private buckets, or a CDN — the
 * bucket stays public-read so plain public URLs resolve (the MVP storage model).
 */
import { Client } from 'minio';
import { buildPublicUrl, qrToolStorageKey } from '../storage-key.helper';
import {
  QR_SVG_CONTENT_TYPE,
  expectedQrObjects,
  isSvgContentType,
  readQrAssetFile,
} from './qr-asset-source';
import type { DrizzleDatabase } from '../../database/database.types';
import { qrTools } from '../../database/schema';
import { QR_TOOL_SEEDS } from '../../database/seeds/required-seed-data';

/** Config needed to recompute and verify seeded QR metadata (no connection). */
export interface QrStorageDescriptor {
  storageProvider: string;
  bucket: string;
  publicBaseUrl: string;
  pathStyle: boolean;
}

/**
 * Anonymous read-only ("download") policy matching `mc anonymous set download`:
 * the bucket and its objects are publicly listable/readable so plain public URLs
 * resolve without signed URLs. No write/delete is granted to anonymous callers.
 */
function publicDownloadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetBucketLocation', 's3:ListBucket'],
        Resource: [`arn:aws:s3:::${bucket}`],
      },
      {
        Effect: 'Allow',
        Principal: { AWS: ['*'] },
        Action: ['s3:GetObject'],
        Resource: [`arn:aws:s3:::${bucket}/*`],
      },
    ],
  });
}

/**
 * Ensure the configured bucket exists and is public-read. Creates the bucket if
 * missing (the health probe never does) and (re)applies the public-download
 * policy. Idempotent: safe to run repeatedly.
 */
export async function ensurePublicBucket(
  client: Client,
  bucket: string,
): Promise<{ created: boolean }> {
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
  }
  await client.setBucketPolicy(bucket, publicDownloadPolicy(bucket));
  return { created: !exists };
}

/** One placed QR object, surfaced for reporting. */
export interface PlacedQrObject {
  id: string;
  title: string;
  storageKey: string;
  bytes: number;
}

/**
 * Upload every seeded QR `.svg` to MinIO under its global storage key
 * (`qr-tools/<id>.svg`), with an SVG content type. Reads the local asset files
 * (failing clearly if any is missing) and overwrites existing objects so the
 * procedure is idempotent. Does not create the bucket — call `ensurePublicBucket`
 * first.
 */
export async function placeQrAssets(
  client: Client,
  bucket: string,
): Promise<PlacedQrObject[]> {
  const placed: PlacedQrObject[] = [];
  for (const object of expectedQrObjects()) {
    const body = readQrAssetFile(object);
    await client.putObject(bucket, object.storageKey, body, body.length, {
      'Content-Type': QR_SVG_CONTENT_TYPE,
    });
    placed.push({
      id: object.id,
      title: object.title,
      storageKey: object.storageKey,
      bytes: body.length,
    });
  }
  return placed;
}

/** Outcome of a successful verification run, surfaced for reporting. */
export interface QrVerifyResult {
  checked: number;
}

/**
 * Verify the seeded QR catalog against config and MinIO. For every `qr_tools`
 * row this checks that:
 *   - the row's storage metadata (provider/bucket/storageKey/publicUrl/format)
 *     matches what config + the global key convention would produce, and the key
 *     stays global (`qr-tools/...`, no `roomId`);
 *   - a corresponding object exists in MinIO with an SVG-compatible content type.
 * It also confirms every seeded tool has a row. Throws an aggregated error
 * listing all problems, so nothing points at a missing/inconsistent object.
 */
export async function verifyQrAssets(params: {
  client: Client;
  db: DrizzleDatabase;
  storage: QrStorageDescriptor;
}): Promise<QrVerifyResult> {
  const { client, db, storage } = params;
  const rows = await db.select().from(qrTools);
  const problems: string[] = [];

  const rowsById = new Map(rows.map((row) => [row.id, row]));
  for (const seed of QR_TOOL_SEEDS) {
    if (!rowsById.has(seed.id)) {
      problems.push(
        `qr_tools row missing for seeded tool "${seed.title}" (${seed.id}) — run \`npm run db:seed\` first`,
      );
    }
  }

  for (const row of rows) {
    const expectedKey = qrToolStorageKey(row.id);
    const expectedUrl = buildPublicUrl({
      publicBaseUrl: storage.publicBaseUrl,
      bucket: storage.bucket,
      storageKey: expectedKey,
      pathStyle: storage.pathStyle,
    });

    if (row.storageProvider !== storage.storageProvider) {
      problems.push(
        `"${row.title}": storageProvider "${row.storageProvider}" != config "${storage.storageProvider}"`,
      );
    }
    if (row.bucket !== storage.bucket) {
      problems.push(
        `"${row.title}": bucket "${row.bucket}" != config "${storage.bucket}"`,
      );
    }
    if (row.storageKey !== expectedKey) {
      problems.push(
        `"${row.title}": storageKey "${row.storageKey}" != expected "${expectedKey}"`,
      );
    }
    if (!row.storageKey.startsWith('qr-tools/')) {
      problems.push(
        `"${row.title}": storageKey "${row.storageKey}" is not global (must start with "qr-tools/")`,
      );
    }
    if (row.publicUrl !== expectedUrl) {
      problems.push(
        `"${row.title}": publicUrl "${row.publicUrl}" != expected "${expectedUrl}"`,
      );
    }
    if (row.fileFormat !== 'svg') {
      problems.push(`"${row.title}": fileFormat "${row.fileFormat}" != "svg"`);
    }

    try {
      const stat = await client.statObject(row.bucket, row.storageKey);
      const contentType = stat.metaData?.['content-type'];
      if (contentType && !isSvgContentType(contentType)) {
        problems.push(
          `"${row.title}": object content-type "${contentType}" is not SVG-compatible (${row.storageKey})`,
        );
      }
    } catch {
      problems.push(
        `"${row.title}": object missing in MinIO — bucket "${row.bucket}", key "${row.storageKey}"`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `found ${problems.length} problem(s):\n${problems
        .map((problem) => `  - ${problem}`)
        .join('\n')}`,
    );
  }

  return { checked: rows.length };
}

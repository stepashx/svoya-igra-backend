import { Client } from 'minio';

/**
 * MinIO provisioning for the seed (Stage 4.2). The runtime `StorageService` is
 * deliberately read-only — its own docs note that bucket creation is "a
 * deploy/seed concern" — so the write side lives here, exercised only by the
 * seed CLI. Every operation is idempotent: re-running the seed neither
 * re-creates the bucket nor duplicates objects.
 *
 * The client is passed in (never constructed here) so these helpers stay pure
 * of configuration and easy to unit-test with a mock.
 */

const SVG_CONTENT_TYPE = 'image/svg+xml';

/**
 * Anonymous read-only bucket policy. The MVP serves QR/presentation files via
 * plain public URLs (plan §18; private buckets / signed URLs are post-MVP per
 * §6), so the stored `public_url` is only reachable once anonymous `GetObject`
 * is allowed on the bucket.
 */
export function buildPublicReadPolicy(bucket: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
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
 * Create the bucket only if it does not already exist. `makeBucket` is never
 * called when the bucket is present, so reruns are safe and quiet.
 */
export async function ensureBucketExists(
  client: Client,
  bucket: string,
): Promise<{ created: boolean }> {
  const exists = await client.bucketExists(bucket);
  if (exists) {
    return { created: false };
  }
  await client.makeBucket(bucket);
  return { created: true };
}

/** Ensure the bucket exists and carries the public-read policy (idempotent). */
export async function provisionBucket(
  client: Client,
  bucket: string,
): Promise<{ created: boolean }> {
  const result = await ensureBucketExists(client, bucket);
  await client.setBucketPolicy(bucket, buildPublicReadPolicy(bucket));
  return result;
}

/** Upload one placeholder QR SVG under its storage key (overwrites on rerun). */
export async function uploadQrToolSvg(
  client: Client,
  params: { bucket: string; storageKey: string; svg: string },
): Promise<void> {
  const body = Buffer.from(params.svg, 'utf8');
  await client.putObject(params.bucket, params.storageKey, body, body.length, {
    'Content-Type': SVG_CONTENT_TYPE,
  });
}

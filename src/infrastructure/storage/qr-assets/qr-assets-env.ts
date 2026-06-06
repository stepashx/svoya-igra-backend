/**
 * Environment wiring for the QR asset CLIs (Stage 5A.7).
 *
 * Like `drizzle.config.ts` and the seed entrypoint, these are build/CLI tooling
 * (not application runtime), so they read `process.env` directly and load `.env`
 * via `dotenv` — the typed Config module governs the running NestJS app, not
 * these scripts. This module centralises the MinIO client, the storage
 * descriptor, and the Drizzle handle so the two CLI entrypoints stay thin.
 */
import { Client } from 'minio';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../../database/schema';
import type { DrizzleDatabase } from '../../database/database.types';
import type { QrStorageDescriptor } from './qr-assets';

/**
 * Render any thrown value as a legible one-line message. MinIO connection
 * failures arrive as an `AggregateError` whose own `message` is empty, so unwrap
 * those and append a system error `code` when present — otherwise a failed run
 * would print a blank reason.
 */
export function formatCliError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    const inner = error.errors.map(formatCliError).join('; ');
    return error.message ? `${error.message} (${inner})` : inner;
  }
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    const base = error.message || error.name;
    return code ? `${base} (${code})` : base;
  }
  return String(error);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env (or export it) before running this script.`,
    );
  }
  return value;
}

/** Build the MinIO client and resolve the target bucket from env. */
export function createMinioClient(): { client: Client; bucket: string } {
  const client = new Client({
    endPoint: requireEnv('MINIO_ENDPOINT'),
    port: Number(process.env.MINIO_PORT ?? '9000'),
    useSSL: (process.env.MINIO_USE_SSL ?? 'false') === 'true',
    accessKey: requireEnv('MINIO_ACCESS_KEY'),
    secretKey: requireEnv('MINIO_SECRET_KEY'),
    pathStyle: (process.env.MINIO_PATH_STYLE ?? 'true') === 'true',
  });
  return { client, bucket: requireEnv('MINIO_BUCKET') };
}

/** Read the config needed to recompute/verify seeded QR metadata. */
export function readQrStorageDescriptor(): QrStorageDescriptor {
  return {
    storageProvider: 'minio',
    bucket: requireEnv('MINIO_BUCKET'),
    publicBaseUrl: requireEnv('MINIO_PUBLIC_URL'),
    pathStyle: (process.env.MINIO_PATH_STYLE ?? 'true') === 'true',
  };
}

/** Open a Drizzle handle (and its pool) for the verification CLI. */
export function createDb(): { pool: Pool; db: DrizzleDatabase } {
  const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });
  return { pool, db: drizzle(pool, { schema }) };
}

import { pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, idPk } from '../_shared/columns';
import { QR_FILE_FORMATS } from '../_shared/enums';

/**
 * A QR tool (plan §12) — a seeded SVG asset stored in MinIO; the DB keeps only
 * metadata and links. The file-location fields (`bucket`, `storage_key`,
 * `public_url`, `file_format`) are NOT NULL because a tool without its SVG is
 * not usable, and the seed always provides them. `storage_provider` is a plain
 * text column defaulting to `'minio'` (set in code/seeds), not an enum.
 *
 * `payload` is left nullable — plan §12 lists it but does not define its
 * meaning; see the open questions in the task report.
 */
export const qrTools = pgTable('qr_tools', {
  id: idPk(),
  title: text('title').notNull(),
  description: text('description'),
  payload: text('payload'),
  fileFormat: text('file_format', { enum: QR_FILE_FORMATS }).notNull(),
  storageProvider: text('storage_provider').notNull().default('minio'),
  bucket: text('bucket').notNull(),
  storageKey: text('storage_key').notNull(),
  publicUrl: text('public_url').notNull(),
  createdAt: createdAt(),
});

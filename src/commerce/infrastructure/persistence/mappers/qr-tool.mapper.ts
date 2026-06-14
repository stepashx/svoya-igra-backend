import { qrTools } from '../../../../infrastructure/database/schema';
import { QrTool } from '../../../domain/entities';

type QrToolRow = typeof qrTools.$inferSelect;

/**
 * Row → entity. QR tools are read-only (a seed-managed catalog), so there is
 * no insert/update mapper. The row's `payload` and storage locator columns
 * (`bucket`, `storageKey`, `storageProvider`) are deliberately dropped — the
 * domain model only carries the consumer-facing `publicUrl`. The `fileFormat`
 * assignment is the compile-time guard between the schema union and the
 * domain union.
 */
export function mapRowToQrTool(row: QrToolRow): QrTool {
  return QrTool.reconstitute({
    id: row.id,
    title: row.title,
    description: row.description,
    fileFormat: row.fileFormat,
    publicUrl: row.publicUrl,
    createdAt: row.createdAt,
  });
}

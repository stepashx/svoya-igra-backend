/**
 * QR asset source resolution (Stage 5A.7) — the bridge between the seeded
 * `qr_tools` catalog and the local `.svg` files placed into MinIO.
 *
 * Pure, side-effect-free except for the explicit `readQrAssetFile` read: it maps
 * each seeded QR tool to its on-disk placeholder `.svg` and to the global,
 * room-agnostic `storageKey` the seed records (`qr-tools/<qrToolId>.svg`). The
 * actual MinIO bucket/object I/O lives in `qr-assets.ts`; this module performs no
 * network calls and knows nothing about MinIO.
 *
 * Asset naming: files are named by the tool's stable `payload` slug
 * (`<payload>.svg`) for human readability, falling back to the tool id when a
 * tool has no payload. The storage key is always derived from the id, so the
 * DB/MinIO contract is independent of the local file name.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { qrToolStorageKey } from '../storage-key.helper';
import {
  QR_TOOL_SEEDS,
  type QrToolSeed,
} from '../../database/seeds/required-seed-data';

/** Content type written on upload and accepted by the consistency check. */
export const QR_SVG_CONTENT_TYPE = 'image/svg+xml';

/** Directory holding the committed QR `.svg` files (resolved at runtime). */
export const QR_ASSETS_DIR = join(__dirname, 'assets');

/** Local file name for a QR tool's `.svg` — `<payload>.svg`, id as fallback. */
export function qrAssetFileName(tool: QrToolSeed): string {
  return `${tool.payload ?? tool.id}.svg`;
}

/** One QR asset to place: its DB identity, local source file, and storage key. */
export interface ExpectedQrObject {
  id: string;
  title: string;
  fileName: string;
  filePath: string;
  storageKey: string;
}

/**
 * The full set of QR objects the procedure must place/verify, derived from the
 * seeded catalog so the placement, the seed metadata, and this list cannot drift.
 */
export function expectedQrObjects(): ExpectedQrObject[] {
  return QR_TOOL_SEEDS.map((tool) => {
    const fileName = qrAssetFileName(tool);
    return {
      id: tool.id,
      title: tool.title,
      fileName,
      filePath: join(QR_ASSETS_DIR, fileName),
      storageKey: qrToolStorageKey(tool.id),
    };
  });
}

/**
 * Read a QR asset's `.svg` bytes, failing with a clear, actionable message when
 * the file is missing — the procedure never invents artwork at runtime.
 */
export function readQrAssetFile(object: ExpectedQrObject): Buffer {
  try {
    return readFileSync(object.filePath);
  } catch {
    throw new Error(
      `Missing QR asset for "${object.title}": expected an SVG at ${object.filePath}. ` +
        `Add the file (see docs/qr-assets.md) before running QR asset placement.`,
    );
  }
}

/** Whether a reported object content type is SVG-compatible. */
export function isSvgContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes('svg');
}

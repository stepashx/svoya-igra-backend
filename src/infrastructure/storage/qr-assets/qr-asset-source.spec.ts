/**
 * DB-free, MinIO-free checks for the QR asset source mapping (Stage 5A.7). These
 * assert the invariants the placement/verification rely on — one expected object
 * per seeded tool, global storage keys (no roomId), committed `.svg` files that
 * exist and are non-empty SVG markup — so a broken asset mapping fails in
 * `npm test` long before it ever touches MinIO. Object existence and config
 * consistency against a live MinIO/DB are enforced separately by
 * `npm run db:verify:qr-assets`.
 */
import { existsSync, readFileSync } from 'fs';
import {
  QR_SVG_CONTENT_TYPE,
  expectedQrObjects,
  isSvgContentType,
} from './qr-asset-source';
import { QR_TOOL_SEEDS } from '../../database/seeds/required-seed-data';

describe('QR asset source', () => {
  const objects = expectedQrObjects();

  it('produces exactly one expected object per seeded QR tool', () => {
    expect(objects).toHaveLength(QR_TOOL_SEEDS.length);
    const ids = objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(QR_TOOL_SEEDS.map((t) => t.id)));
  });

  it('uses global storage keys with no roomId', () => {
    for (const object of objects) {
      expect(object.storageKey).toBe(`qr-tools/${object.id}.svg`);
      expect(object.storageKey).not.toContain('rooms/');
    }
    const keys = objects.map((o) => o.storageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('points every tool at a committed, non-empty SVG file', () => {
    for (const object of objects) {
      expect(existsSync(object.filePath)).toBe(true);
      const content = readFileSync(object.filePath, 'utf8');
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('<svg');
    }
  });

  it('declares the SVG content type and recognises it as SVG-compatible', () => {
    expect(QR_SVG_CONTENT_TYPE).toBe('image/svg+xml');
    expect(isSvgContentType(QR_SVG_CONTENT_TYPE)).toBe(true);
    expect(isSvgContentType('image/svg+xml; charset=utf-8')).toBe(true);
    expect(isSvgContentType('application/octet-stream')).toBe(false);
  });
});

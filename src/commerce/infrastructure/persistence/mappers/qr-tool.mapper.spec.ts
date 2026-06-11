import { qrTools } from '../../../../infrastructure/database/schema';
import { mapRowToQrTool } from './qr-tool.mapper';

describe('qr-tool.mapper', () => {
  const row: typeof qrTools.$inferSelect = {
    id: 'qr-1',
    title: 'Double points QR',
    description: 'Scan to double the next answer score.',
    payload: '{"kind":"double-points"}',
    fileFormat: 'SVG',
    storageProvider: 'minio',
    bucket: 'qr-tools',
    storageKey: 'qr-1.svg',
    publicUrl: 'https://minio.local/qr-tools/qr-1.svg',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('maps a row to a qr-tool entity', () => {
    const tool = mapRowToQrTool(row);
    expect(tool.id).toBe('qr-1');
    expect(tool.title).toBe('Double points QR');
    expect(tool.description).toBe('Scan to double the next answer score.');
    expect(tool.fileFormat).toBe('SVG');
    expect(tool.publicUrl).toBe('https://minio.local/qr-tools/qr-1.svg');
    expect(tool.createdAt).toBe(row.createdAt);
  });

  it('drops payload and the storage locator columns', () => {
    const tool = mapRowToQrTool(row);
    expect(tool).not.toHaveProperty('payload');
    expect(tool).not.toHaveProperty('bucket');
    expect(tool).not.toHaveProperty('storageKey');
    expect(tool).not.toHaveProperty('storageProvider');
  });
});

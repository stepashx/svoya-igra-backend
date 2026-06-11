import { QrTool } from './qr-tool';

describe('QrTool', () => {
  it('reconstitutes and exposes every field through getters', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const tool = QrTool.reconstitute({
      id: 'qr-1',
      title: 'Double points QR',
      description: 'Scan to double the next answer score.',
      fileFormat: 'SVG',
      publicUrl: 'https://minio.local/qr-tools/qr-1.svg',
      createdAt,
    });
    expect(tool.id).toBe('qr-1');
    expect(tool.title).toBe('Double points QR');
    expect(tool.description).toBe('Scan to double the next answer score.');
    expect(tool.fileFormat).toBe('SVG');
    expect(tool.publicUrl).toBe('https://minio.local/qr-tools/qr-1.svg');
    expect(tool.createdAt).toBe(createdAt);
  });

  it('carries a null description', () => {
    const tool = QrTool.reconstitute({
      id: 'qr-2',
      title: 'Hint QR',
      description: null,
      fileFormat: 'SVG',
      publicUrl: 'https://minio.local/qr-tools/qr-2.svg',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(tool.description).toBeNull();
  });

  it('does not model payload or storage locator fields', () => {
    const tool = QrTool.reconstitute({
      id: 'qr-3',
      title: 'Hint QR',
      description: null,
      fileFormat: 'SVG',
      publicUrl: 'https://minio.local/qr-tools/qr-3.svg',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect(tool).not.toHaveProperty('payload');
    expect(tool).not.toHaveProperty('bucket');
    expect(tool).not.toHaveProperty('storageKey');
    expect(tool).not.toHaveProperty('storageProvider');
  });
});

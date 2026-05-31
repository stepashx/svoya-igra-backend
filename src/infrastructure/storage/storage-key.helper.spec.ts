import {
  buildPublicUrl,
  normalizeStorageKey,
  presentationStorageKey,
  qrToolStorageKey,
} from './storage-key.helper';

describe('storage-key helpers', () => {
  describe('normalizeStorageKey', () => {
    it('trims segments and collapses duplicate/empty slashes', () => {
      expect(normalizeStorageKey('/qr-tools//abc.svg/')).toBe(
        'qr-tools/abc.svg',
      );
      expect(normalizeStorageKey(' rooms / 1 / file.pdf ')).toBe(
        'rooms/1/file.pdf',
      );
    });
  });

  describe('qrToolStorageKey', () => {
    it('builds a global key with no roomId', () => {
      expect(qrToolStorageKey('tool-1')).toBe('qr-tools/tool-1.svg');
    });
  });

  describe('presentationStorageKey', () => {
    it('builds a room/team-scoped key and strips a leading dot in the extension', () => {
      expect(
        presentationStorageKey({
          roomId: 'r1',
          teamId: 't2',
          submissionId: 's3',
          extension: '.pdf',
        }),
      ).toBe('rooms/r1/presentations/t2/s3.pdf');
    });
  });

  describe('buildPublicUrl', () => {
    const base = {
      publicBaseUrl: 'http://localhost:9000',
      bucket: 'svoya-igra',
    };

    it('builds a path-style URL', () => {
      expect(
        buildPublicUrl({
          ...base,
          storageKey: 'qr-tools/tool-1.svg',
          pathStyle: true,
        }),
      ).toBe('http://localhost:9000/svoya-igra/qr-tools/tool-1.svg');
    });

    it('trims a trailing slash on the base URL', () => {
      expect(
        buildPublicUrl({
          ...base,
          publicBaseUrl: 'http://localhost:9000/',
          storageKey: '/qr-tools/tool-1.svg',
          pathStyle: true,
        }),
      ).toBe('http://localhost:9000/svoya-igra/qr-tools/tool-1.svg');
    });

    it('builds a virtual-hosted URL when path-style is disabled', () => {
      expect(
        buildPublicUrl({
          ...base,
          storageKey: 'qr-tools/tool-1.svg',
          pathStyle: false,
        }),
      ).toBe('http://svoya-igra.localhost:9000/qr-tools/tool-1.svg');
    });
  });
});

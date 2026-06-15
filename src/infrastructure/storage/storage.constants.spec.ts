import { canonicalMime } from './storage.constants';

describe('canonicalMime', () => {
  it.each([
    ['pdf', 'application/pdf'],
    ['ppt', 'application/vnd.ms-powerpoint'],
    [
      'pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  ])('maps "%s" to its server-canonical MIME', (ext, mime) => {
    expect(canonicalMime(ext)).toBe(mime);
  });

  it('lowercases the extension before mapping', () => {
    expect(canonicalMime('PDF')).toBe('application/pdf');
  });

  it('falls back to octet-stream for an unknown extension (benign download)', () => {
    // A non-executable default — defensive only, the use case validates first.
    expect(canonicalMime('exe')).toBe('application/octet-stream');
    expect(canonicalMime('')).toBe('application/octet-stream');
  });
});

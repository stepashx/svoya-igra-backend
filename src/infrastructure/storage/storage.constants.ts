/** DI token for the S3-compatible (MinIO) client. */
export const STORAGE_CLIENT = Symbol('STORAGE_CLIENT');

/**
 * Top-level key prefixes for the two file-owning areas. Object bytes live in
 * MinIO; PostgreSQL stores only metadata (Stage 5A onward).
 *
 * - QR tools are global/static seeded assets, so their keys carry no roomId:
 *     `qr-tools/<qrToolId>.svg`
 * - Presentation uploads are runtime room/team files:
 *     `rooms/<roomId>/presentations/<teamId>/<submissionId>.<ext>`
 */
export const QR_TOOLS_KEY_PREFIX = 'qr-tools';
export const PRESENTATIONS_ROOT_PREFIX = 'rooms';

/**
 * SERVER-canonical `Content-Type` per allowed presentation extension. The
 * upload use case derives the stored MIME from the file EXTENSION through this
 * map — NEVER from the client-supplied `mimetype` — and passes it to
 * {@link FileStoragePort.putPresentation}. This is the stored-XSS guard
 * (recon B2): the bucket is public-read, so a captain could otherwise upload
 * `evil.pdf` whose bytes are HTML with a client `Content-Type: text/html` and
 * have it execute in the host's browser when the public URL is opened. Pinning
 * the response `Content-Type` to a benign canonical MIME (plus the
 * `Content-Disposition: attachment` set in {@link StorageService}) defuses that.
 */
export const PRESENTATION_CONTENT_TYPES: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/**
 * Map an allowlisted presentation extension to its SERVER-canonical MIME. Falls
 * back to `application/octet-stream` (a benign download, never executed) for any
 * extension not in {@link PRESENTATION_CONTENT_TYPES} — defensive, since the use
 * case only calls this after validating the extension against the allowlist.
 */
export function canonicalMime(extension: string): string {
  return (
    PRESENTATION_CONTENT_TYPES[extension.toLowerCase()] ??
    'application/octet-stream'
  );
}

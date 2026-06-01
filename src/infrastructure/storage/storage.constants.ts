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

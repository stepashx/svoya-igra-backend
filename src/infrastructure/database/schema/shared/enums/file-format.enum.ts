/**
 * Allowed file formats for presentation uploads. PostgreSQL stores only the
 * format alongside other upload metadata; the bytes live in MinIO (see
 * docs/minio.md). No dedicated `files` table — metadata sits on
 * `presentation_submissions` (later sub-stage).
 *
 * Constrained text column + derived union (see {@link RoomStatus}).
 */
export const FILE_FORMATS = ['pdf', 'pptx'] as const;

export type FileFormat = (typeof FILE_FORMATS)[number];

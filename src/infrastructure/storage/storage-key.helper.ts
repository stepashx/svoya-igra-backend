import {
  PRESENTATIONS_ROOT_PREFIX,
  QR_TOOLS_KEY_PREFIX,
} from './storage.constants';

/**
 * Pure helpers for building the stable `storageKey` (the durable object
 * handle) and the public URL. No I/O — these compute conventions only; actual
 * upload/retrieval behavior arrives with the feature stages.
 */

/** Trim and collapse slashes so keys are stable and free of empty segments. */
export function normalizeStorageKey(key: string): string {
  return key
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join('/');
}

/** Global/static QR-tool asset key (no roomId): `qr-tools/<qrToolId>.svg`. */
export function qrToolStorageKey(qrToolId: string): string {
  return normalizeStorageKey(`${QR_TOOLS_KEY_PREFIX}/${qrToolId}.svg`);
}

/**
 * Runtime presentation upload key, scoped by room and team:
 * `rooms/<roomId>/presentations/<teamId>/<submissionId>.<ext>`.
 */
export function presentationStorageKey(params: {
  roomId: string;
  teamId: string;
  submissionId: string;
  extension: string;
}): string {
  const ext = params.extension.replace(/^\.+/, '');
  return normalizeStorageKey(
    `${PRESENTATIONS_ROOT_PREFIX}/${params.roomId}/presentations/${params.teamId}/${params.submissionId}.${ext}`,
  );
}

/**
 * Build the public URL the frontend opens directly (public bucket in MVP).
 * Path-style: `<base>/<bucket>/<key>`. Virtual-hosted: `<bucket>.<host>/<key>`.
 */
export function buildPublicUrl(params: {
  publicBaseUrl: string;
  bucket: string;
  storageKey: string;
  pathStyle: boolean;
}): string {
  const key = normalizeStorageKey(params.storageKey);
  const base = params.publicBaseUrl.replace(/\/+$/, '');

  if (params.pathStyle) {
    return `${base}/${params.bucket}/${key}`;
  }

  const url = new URL(base);
  url.host = `${params.bucket}.${url.host}`;
  return `${url.origin}/${key}`;
}

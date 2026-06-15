/**
 * Outbound port for WRITING uploaded files to the object store — the project's
 * first storage-write seam (Stage 9). The application layer depends on this;
 * the infrastructure StorageService implements it as pure S3/MinIO transport,
 * exactly as the WebSocket gateway implements {@link RealtimeEventsPort}.
 *
 * It lives in core/ports as a neutral graph leaf (alongside RealtimeEventsPort
 * / ClockPort / TokenGeneratorPort), NOT in a feature module: placing it in
 * presentation/ or game-session/ would force the infrastructure adapter to
 * import a feature (infra→feature) and risk a StorageModule↔feature cycle.
 * Here the only edges are core/ports(leaf) ← infrastructure/storage(implements)
 * ← consumers(inject) — acyclic.
 */
export interface FileStoragePort {
  /** Persist one uploaded presentation file and return its durable location. */
  putPresentation(params: PutPresentationParams): Promise<StoredFileLocator>;
}

/** Coordinates + bytes for one presentation upload (supplied by the use case). */
export interface PutPresentationParams {
  roomId: string;
  teamId: string;
  submissionId: string;
  extension: string;
  body: Buffer;
  size: number;
  contentType: string;
}

/** Where a stored object lives — the metadata persisted alongside the row. */
export interface StoredFileLocator {
  storageProvider: string;
  bucket: string;
  storageKey: string;
  publicUrl: string;
}

export const FILE_STORAGE_PORT = Symbol('FileStoragePort');

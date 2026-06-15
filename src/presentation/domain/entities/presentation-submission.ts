import { SubmissionStatus } from '../types';

/**
 * Fields the upload use case supplies for a brand-new submission (caller-supplied
 * id, storage locator from {@link FileStoragePort}). `deadlineAt` and the
 * configured `latePenalty` come in; the entity DERIVES the rest (see {@link
 * PresentationSubmission.create}).
 */
export interface PresentationSubmissionCreateProps {
  id: string;
  roomId: string;
  teamId: string;
  uploadedByPlayerId: string | null;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  storageProvider: string;
  bucket: string;
  storageKey: string;
  publicUrl: string;
  deadlineAt: Date;
  /** The configured §25 penalty to charge IF the upload is late (else 0 is stored). */
  latePenalty: number;
}

/** Full persisted state used to rehydrate a submission from the database. */
export interface PresentationSubmissionReconstituteProps {
  id: string;
  roomId: string;
  teamId: string;
  uploadedByPlayerId: string | null;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  storageProvider: string;
  bucket: string;
  storageKey: string;
  publicUrl: string;
  uploadedAt: Date;
  deadlineAt: Date;
  isLate: boolean;
  latePenalty: number;
  status: SubmissionStatus;
}

/**
 * An uploaded presentation file (plan §12) — the create-on-upload record: a row
 * exists only once a file is uploaded, so every file-location field is present
 * and the stored object in MinIO is described by `storageKey` / `publicUrl`.
 *
 * An immutable fact like {@link Purchase}: once created it never changes, so
 * there are no mutators — only {@link create} (id from the caller, the
 * ID_GENERATOR pattern) and {@link reconstitute}.
 *
 * {@link create} OWNS the late invariant: it DERIVES `isLate`, `status`, and the
 * EFFECTIVE `latePenalty` from `(now, deadlineAt)`, never accepting them ready —
 * `isLate = now > deadlineAt`, `status = isLate ? 'LATE' : 'UPLOADED'`, and the
 * stored `latePenalty` is the configured value when late, else 0. The invariant
 * `status ⟺ isLate` is therefore unbreakable by construction, and the EFFECTIVE
 * penalty (0 when on time) is what persists — so Stage 10 subtracts it
 * unconditionally without re-checking the deadline.
 */
export class PresentationSubmission {
  private constructor(
    private readonly _id: string,
    private readonly _roomId: string,
    private readonly _teamId: string,
    private readonly _uploadedByPlayerId: string | null,
    private readonly _originalFileName: string,
    private readonly _mimeType: string,
    private readonly _fileSize: number,
    private readonly _storageProvider: string,
    private readonly _bucket: string,
    private readonly _storageKey: string,
    private readonly _publicUrl: string,
    private readonly _uploadedAt: Date,
    private readonly _deadlineAt: Date,
    private readonly _isLate: boolean,
    private readonly _latePenalty: number,
    private readonly _status: SubmissionStatus,
  ) {}

  /**
   * Record a fresh upload stamped at `now`, deriving the late invariant from the
   * deadline. The stored `latePenalty` is the EFFECTIVE penalty: the configured
   * value when late, 0 when on time.
   */
  static create(
    props: PresentationSubmissionCreateProps,
    now: Date,
  ): PresentationSubmission {
    const isLate = now.getTime() > props.deadlineAt.getTime();
    const status: SubmissionStatus = isLate ? 'LATE' : 'UPLOADED';
    const latePenalty = isLate ? props.latePenalty : 0;
    return new PresentationSubmission(
      props.id,
      props.roomId,
      props.teamId,
      props.uploadedByPlayerId,
      props.originalFileName,
      props.mimeType,
      props.fileSize,
      props.storageProvider,
      props.bucket,
      props.storageKey,
      props.publicUrl,
      now,
      props.deadlineAt,
      isLate,
      latePenalty,
      status,
    );
  }

  /** Rehydrate a submission from persisted state (used by the mapper). */
  static reconstitute(
    props: PresentationSubmissionReconstituteProps,
  ): PresentationSubmission {
    return new PresentationSubmission(
      props.id,
      props.roomId,
      props.teamId,
      props.uploadedByPlayerId,
      props.originalFileName,
      props.mimeType,
      props.fileSize,
      props.storageProvider,
      props.bucket,
      props.storageKey,
      props.publicUrl,
      props.uploadedAt,
      props.deadlineAt,
      props.isLate,
      props.latePenalty,
      props.status,
    );
  }

  get id(): string {
    return this._id;
  }

  get roomId(): string {
    return this._roomId;
  }

  get teamId(): string {
    return this._teamId;
  }

  get uploadedByPlayerId(): string | null {
    return this._uploadedByPlayerId;
  }

  get originalFileName(): string {
    return this._originalFileName;
  }

  get mimeType(): string {
    return this._mimeType;
  }

  get fileSize(): number {
    return this._fileSize;
  }

  get storageProvider(): string {
    return this._storageProvider;
  }

  get bucket(): string {
    return this._bucket;
  }

  get storageKey(): string {
    return this._storageKey;
  }

  get publicUrl(): string {
    return this._publicUrl;
  }

  get uploadedAt(): Date {
    return this._uploadedAt;
  }

  get deadlineAt(): Date {
    return this._deadlineAt;
  }

  get isLate(): boolean {
    return this._isLate;
  }

  get latePenalty(): number {
    return this._latePenalty;
  }

  get status(): SubmissionStatus {
    return this._status;
  }
}

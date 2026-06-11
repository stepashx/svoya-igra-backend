import { QrFileFormat } from '../types';

/** Full persisted state used to rehydrate a QR tool from the database. */
export interface QrToolReconstituteProps {
  id: string;
  title: string;
  description: string | null;
  fileFormat: QrFileFormat;
  publicUrl: string;
  createdAt: Date;
}

/**
 * A QR tool (plan §12) — a GLOBAL, seed-managed SVG asset a team obtains by
 * buying its shop item. Read-only in the domain, so there is only
 * {@link QrTool.reconstitute} (no `create` and no mutators).
 *
 * Deliberately narrower than the `qr_tools` table: `payload` (plan §12 lists it
 * but does not define its semantics) and the storage locator fields (`bucket`,
 * `storageKey`, `storageProvider`) are NOT modelled — the domain only needs the
 * consumer-facing `publicUrl`. The mapper drops the omitted columns on read.
 *
 * `publicUrl` is owned by the buying team: it must never enter a room-wide
 * payload (see the Commerce section of docs/realtime-events.md).
 */
export class QrTool {
  private constructor(
    private readonly _id: string,
    private readonly _title: string,
    private readonly _description: string | null,
    private readonly _fileFormat: QrFileFormat,
    private readonly _publicUrl: string,
    private readonly _createdAt: Date,
  ) {}

  /** Rehydrate a QR tool from persisted state (used by the mapper). */
  static reconstitute(props: QrToolReconstituteProps): QrTool {
    return new QrTool(
      props.id,
      props.title,
      props.description,
      props.fileFormat,
      props.publicUrl,
      props.createdAt,
    );
  }

  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get description(): string | null {
    return this._description;
  }

  get fileFormat(): QrFileFormat {
    return this._fileFormat;
  }

  get publicUrl(): string {
    return this._publicUrl;
  }

  get createdAt(): Date {
    return this._createdAt;
  }
}

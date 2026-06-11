/** Fields required to record a brand-new inventory entry (caller-supplied id). */
export interface InventoryItemCreateProps {
  id: string;
  roomId: string;
  teamId: string;
  shopItemId: string;
  qrToolId: string;
}

/** Full persisted state used to rehydrate an inventory entry from the database. */
export interface InventoryItemReconstituteProps {
  id: string;
  roomId: string;
  teamId: string;
  shopItemId: string;
  qrToolId: string;
  addedAt: Date;
}

/**
 * An inventory entry (plan §12) — the QR tool a team owns after buying its shop
 * item, scoped to the room. An immutable fact: once added it never changes, so
 * there are no mutators — only {@link create} (id from the caller, ID_GENERATOR
 * pattern) and {@link reconstitute}.
 */
export class InventoryItem {
  private constructor(
    private readonly _id: string,
    private readonly _roomId: string,
    private readonly _teamId: string,
    private readonly _shopItemId: string,
    private readonly _qrToolId: string,
    private readonly _addedAt: Date,
  ) {}

  /** Record a fresh inventory entry, stamped with the moment it was added. */
  static create(props: InventoryItemCreateProps, now: Date): InventoryItem {
    return new InventoryItem(
      props.id,
      props.roomId,
      props.teamId,
      props.shopItemId,
      props.qrToolId,
      now,
    );
  }

  /** Rehydrate an inventory entry from persisted state (used by the mapper). */
  static reconstitute(props: InventoryItemReconstituteProps): InventoryItem {
    return new InventoryItem(
      props.id,
      props.roomId,
      props.teamId,
      props.shopItemId,
      props.qrToolId,
      props.addedAt,
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

  get shopItemId(): string {
    return this._shopItemId;
  }

  get qrToolId(): string {
    return this._qrToolId;
  }

  get addedAt(): Date {
    return this._addedAt;
  }
}

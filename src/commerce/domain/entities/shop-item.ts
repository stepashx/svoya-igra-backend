/** Full persisted state used to rehydrate a shop item from the database. */
export interface ShopItemReconstituteProps {
  id: string;
  title: string;
  description: string | null;
  price: number;
  qrToolId: string;
  createdAt: Date;
}

/**
 * A shop item (plan §12) — a GLOBAL, seed-managed catalog entry. Read-only in
 * the domain: items are never created or mutated through the commerce feature,
 * so there is only {@link ShopItem.reconstitute} (no `create` and no mutators).
 * There is deliberately no `isPurchased` here — per-room, per-game purchase
 * state lives in the {@link Purchase} records, not on the global catalog.
 */
export class ShopItem {
  private constructor(
    private readonly _id: string,
    private readonly _title: string,
    private readonly _description: string | null,
    private readonly _price: number,
    private readonly _qrToolId: string,
    private readonly _createdAt: Date,
  ) {}

  /** Rehydrate a shop item from persisted state (used by the mapper). */
  static reconstitute(props: ShopItemReconstituteProps): ShopItem {
    return new ShopItem(
      props.id,
      props.title,
      props.description,
      props.price,
      props.qrToolId,
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

  get price(): number {
    return this._price;
  }

  get qrToolId(): string {
    return this._qrToolId;
  }

  get createdAt(): Date {
    return this._createdAt;
  }
}

/** Fields required to record a brand-new purchase (caller-supplied id). */
export interface PurchaseCreateProps {
  id: string;
  roomId: string;
  teamId: string;
  shopItemId: string;
  price: number;
}

/** Full persisted state used to rehydrate a purchase from the database. */
export interface PurchaseReconstituteProps {
  id: string;
  roomId: string;
  teamId: string;
  shopItemId: string;
  price: number;
  purchasedAt: Date;
}

/**
 * A completed purchase (plan §12) — the per-room record that makes a global
 * shop item "bought" in this game (§14.8: an item is unique across the whole
 * game, enforced by `purchases_room_id_shop_item_id_uq`). `price` is a snapshot
 * of the item's price at purchase time.
 *
 * An immutable fact: once created it never changes, so there are no mutators —
 * only {@link create} (id from the caller, ID_GENERATOR pattern) and
 * {@link reconstitute}.
 */
export class Purchase {
  private constructor(
    private readonly _id: string,
    private readonly _roomId: string,
    private readonly _teamId: string,
    private readonly _shopItemId: string,
    private readonly _price: number,
    private readonly _purchasedAt: Date,
  ) {}

  /** Record a fresh purchase, stamped with the moment it happened. */
  static create(props: PurchaseCreateProps, now: Date): Purchase {
    return new Purchase(
      props.id,
      props.roomId,
      props.teamId,
      props.shopItemId,
      props.price,
      now,
    );
  }

  /** Rehydrate a purchase from persisted state (used by the mapper). */
  static reconstitute(props: PurchaseReconstituteProps): Purchase {
    return new Purchase(
      props.id,
      props.roomId,
      props.teamId,
      props.shopItemId,
      props.price,
      props.purchasedAt,
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

  get price(): number {
    return this._price;
  }

  get purchasedAt(): Date {
    return this._purchasedAt;
  }
}

/** Full persisted state used to rehydrate a category from the database. */
export interface CategoryReconstituteProps {
  id: string;
  title: string;
  position: number;
}

/**
 * A board category (plan §12) — a GLOBAL, seed-managed catalog entry (6 of them).
 * Read-only in the domain: categories are never created or mutated through the
 * gameplay feature, so there is only {@link Category.reconstitute} (no `create`
 * and no mutators). Per-room cells reference it from `board_cells.category_id`.
 */
export class Category {
  private constructor(
    private readonly _id: string,
    private readonly _title: string,
    private readonly _position: number,
  ) {}

  /** Rehydrate a category from persisted state (used by the mapper). */
  static reconstitute(props: CategoryReconstituteProps): Category {
    return new Category(props.id, props.title, props.position);
  }

  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get position(): number {
    return this._position;
  }
}

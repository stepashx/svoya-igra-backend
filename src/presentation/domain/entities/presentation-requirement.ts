/** Full persisted state used to rehydrate a requirement from the database. */
export interface PresentationRequirementReconstituteProps {
  id: string;
  title: string;
  description: string | null;
  order: number;
  isRequired: boolean;
}

/**
 * A presentation requirement/condition shown during preparation (plan §12) — a
 * GLOBAL, seed-managed catalog entry. Read-only in the domain, exactly like
 * {@link ShopItem}: requirements are never created or mutated through the
 * presentation feature, so there is only {@link PresentationRequirement.reconstitute}
 * (no `create`, no mutators, no business logic). `order` drives the display
 * sequence; `isRequired` marks a condition mandatory unless a seed opts it out.
 */
export class PresentationRequirement {
  private constructor(
    private readonly _id: string,
    private readonly _title: string,
    private readonly _description: string | null,
    private readonly _order: number,
    private readonly _isRequired: boolean,
  ) {}

  /** Rehydrate a requirement from persisted state (used by the mapper). */
  static reconstitute(
    props: PresentationRequirementReconstituteProps,
  ): PresentationRequirement {
    return new PresentationRequirement(
      props.id,
      props.title,
      props.description,
      props.order,
      props.isRequired,
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

  get order(): number {
    return this._order;
  }

  get isRequired(): boolean {
    return this._isRequired;
  }
}

/** Full persisted state used to rehydrate a criterion from the database. */
export interface EvaluationCriterionReconstituteProps {
  id: string;
  title: string;
  description: string | null;
  minScore: number;
  maxScore: number;
  order: number;
}

/**
 * A seeded evaluation criterion (plan §12) — in MVP "Раскрытие темы" (order 0,
 * 0–10) and "Дизайн презентации" (order 1, 0–10). A GLOBAL, seed-managed
 * catalog entry, read-only in the domain exactly like {@link ShopItem} /
 * {@link PresentationRequirement}: criteria are never created or mutated through
 * the evaluation feature, so there is only {@link reconstitute} (no `create`, no
 * mutators). `order` is the authoritative position — the submit use case maps
 * `order 0 → topicScore` and `order 1 → designScore` by it, never by the
 * localized `title`.
 */
export class EvaluationCriterion {
  private constructor(
    private readonly _id: string,
    private readonly _title: string,
    private readonly _description: string | null,
    private readonly _minScore: number,
    private readonly _maxScore: number,
    private readonly _order: number,
  ) {}

  /** Rehydrate a criterion from persisted state (used by the mapper). */
  static reconstitute(
    props: EvaluationCriterionReconstituteProps,
  ): EvaluationCriterion {
    return new EvaluationCriterion(
      props.id,
      props.title,
      props.description,
      props.minScore,
      props.maxScore,
      props.order,
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

  get minScore(): number {
    return this._minScore;
  }

  get maxScore(): number {
    return this._maxScore;
  }

  get order(): number {
    return this._order;
  }
}

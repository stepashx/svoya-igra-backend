/** Full persisted state used to rehydrate a topic from the database. */
export interface TopicReconstituteProps {
  id: string;
  title: string;
  description: string | null;
}

/**
 * A presentation topic (plan §12) — a GLOBAL, seed-managed catalog entry.
 * Read-only in the domain: topics are never created or mutated through the
 * game-session feature, so there is only {@link Topic.reconstitute} (no `create`
 * and no mutators). Per-room selection lives on {@link Team} (`selectedTopicId`).
 */
export class Topic {
  private constructor(
    private readonly _id: string,
    private readonly _title: string,
    private readonly _description: string | null,
  ) {}

  /** Rehydrate a topic from persisted state (used by the mapper). */
  static reconstitute(props: TopicReconstituteProps): Topic {
    return new Topic(props.id, props.title, props.description);
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
}

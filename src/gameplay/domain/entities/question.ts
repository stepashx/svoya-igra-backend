/** Full persisted state used to rehydrate a question from the database. */
export interface QuestionReconstituteProps {
  id: string;
  categoryId: string;
  text: string;
  correctAnswer: string;
  points: number;
  position: number;
  createdAt: Date;
}

/**
 * A seeded question (plan §12 / Этап2 §8) — a GLOBAL, seed-managed catalog entry
 * (30 of them). Read-only in the domain: questions are never created or mutated
 * through the gameplay feature, so there is only {@link Question.reconstitute}
 * (no `create` and no mutators).
 *
 * `correctAnswer` lives on the backend and is exposed here as a plain getter; it
 * is the host-only field. Hiding it from the room-facing view is a
 * presentation-layer boundary (room-view DTO omits it, host-view includes it) —
 * the domain holds the truth, the presentation decides who sees it.
 */
export class Question {
  private constructor(
    private readonly _id: string,
    private readonly _categoryId: string,
    private readonly _text: string,
    private readonly _correctAnswer: string,
    private readonly _points: number,
    private readonly _position: number,
    private readonly _createdAt: Date,
  ) {}

  /** Rehydrate a question from persisted state (used by the mapper). */
  static reconstitute(props: QuestionReconstituteProps): Question {
    return new Question(
      props.id,
      props.categoryId,
      props.text,
      props.correctAnswer,
      props.points,
      props.position,
      props.createdAt,
    );
  }

  get id(): string {
    return this._id;
  }

  get categoryId(): string {
    return this._categoryId;
  }

  get text(): string {
    return this._text;
  }

  /** The correct answer (host-only; the presentation layer gates exposure). */
  get correctAnswer(): string {
    return this._correctAnswer;
  }

  get points(): number {
    return this._points;
  }

  get position(): number {
    return this._position;
  }

  get createdAt(): Date {
    return this._createdAt;
  }
}

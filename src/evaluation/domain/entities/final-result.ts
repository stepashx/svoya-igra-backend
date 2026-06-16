/**
 * Fields the {@link CalculateResultsUseCase} supplies for a brand-new result
 * (caller-supplied id, cross-team `place` already resolved). The entity DERIVES
 * `presentationScoreFinal` and `finalScore` from the raw inputs via the single
 * {@link FinalResult.deriveScores} helper — they are NOT accepted ready.
 */
export interface FinalResultCreateProps {
  id: string;
  roomId: string;
  teamId: string;
  /** The team's quiz score snapshot (§14.7 `earned_score`), an integer. */
  earnedScore: number;
  /** The raw weighted-average presentation score Σ(w·s)/Σw (§14.10), a double. */
  presentationScoreRaw: number;
  /** The effective §9 late penalty snapshot (0 when there is no late submission). */
  latePenalty: number;
  /** The cross-team place (1-based, dense), resolved by the use case before create. */
  place: number;
}

/** Full persisted state used to rehydrate a result from the database. */
export interface FinalResultReconstituteProps {
  id: string;
  roomId: string;
  teamId: string;
  earnedScore: number;
  presentationScoreRaw: number;
  latePenalty: number;
  presentationScoreFinal: number;
  finalScore: number;
  place: number;
  calculatedAt: Date;
}

/**
 * The computed final result for one team (plan §12, §14.10) — a write-once,
 * immutable fact like {@link EvaluationScore} / {@link PresentationSubmission}:
 * once calculated it never changes, so there are no mutators, only {@link create}
 * (id from the caller, the ID_GENERATOR pattern) and {@link reconstitute}.
 *
 * {@link create} OWNS the §14.10 derivation through the single
 * {@link deriveScores} helper:
 *
 * - `presentationScoreFinal = max(0, presentationScoreRaw − latePenalty)` — the
 *   penalty can never push the presentation score below zero;
 * - `finalScore = earnedScore × presentationScoreFinal` — the presentation acts
 *   as a MULTIPLICATIVE gate: a zero presentation score collapses the final
 *   score to 0 regardless of the quiz `earnedScore` (§14.10 floor=0).
 *
 * The SAME helper is called by the use case while ranking the in-memory drafts,
 * so the place the use case assigns can never drift from the `finalScore` the
 * entity stores. Nothing here is rounded — the raw double is preserved (a results
 * read renders/sorts; it does not need a stored rounding).
 */
export class FinalResult {
  private constructor(
    private readonly _id: string,
    private readonly _roomId: string,
    private readonly _teamId: string,
    private readonly _earnedScore: number,
    private readonly _presentationScoreRaw: number,
    private readonly _latePenalty: number,
    private readonly _presentationScoreFinal: number,
    private readonly _finalScore: number,
    private readonly _place: number,
    private readonly _calculatedAt: Date,
  ) {}

  /**
   * The §14.10 score derivation, in ONE place: clamp the penalty-adjusted
   * presentation average at zero, then multiply by the quiz score. Called by both
   * {@link create} (the stored values) and the use case (the in-memory ranking
   * draft) so place and finalScore can never disagree.
   */
  static deriveScores(
    presentationScoreRaw: number,
    latePenalty: number,
    earnedScore: number,
  ): { presentationScoreFinal: number; finalScore: number } {
    const presentationScoreFinal = Math.max(
      0,
      presentationScoreRaw - latePenalty,
    );
    const finalScore = earnedScore * presentationScoreFinal;
    return { presentationScoreFinal, finalScore };
  }

  /**
   * Record a fresh result stamped at `now`, deriving the final/presentation
   * scores from the raw inputs. `place` is the cross-team rank the use case has
   * already resolved (it depends on every team, so it cannot be derived here).
   */
  static create(props: FinalResultCreateProps, now: Date): FinalResult {
    const { presentationScoreFinal, finalScore } = FinalResult.deriveScores(
      props.presentationScoreRaw,
      props.latePenalty,
      props.earnedScore,
    );
    return new FinalResult(
      props.id,
      props.roomId,
      props.teamId,
      props.earnedScore,
      props.presentationScoreRaw,
      props.latePenalty,
      presentationScoreFinal,
      finalScore,
      props.place,
      now,
    );
  }

  /** Rehydrate a result from persisted state (used by the mapper) — no derivation. */
  static reconstitute(props: FinalResultReconstituteProps): FinalResult {
    return new FinalResult(
      props.id,
      props.roomId,
      props.teamId,
      props.earnedScore,
      props.presentationScoreRaw,
      props.latePenalty,
      props.presentationScoreFinal,
      props.finalScore,
      props.place,
      props.calculatedAt,
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

  get earnedScore(): number {
    return this._earnedScore;
  }

  get presentationScoreRaw(): number {
    return this._presentationScoreRaw;
  }

  get latePenalty(): number {
    return this._latePenalty;
  }

  get presentationScoreFinal(): number {
    return this._presentationScoreFinal;
  }

  get finalScore(): number {
    return this._finalScore;
  }

  get place(): number {
    return this._place;
  }

  get calculatedAt(): Date {
    return this._calculatedAt;
  }
}

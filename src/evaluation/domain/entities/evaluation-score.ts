import {
  EvaluationAlreadyConfirmedError,
  InvalidEvaluatorError,
} from '../errors';
import { EvaluatorType } from '../types';

/**
 * Fields the submit use case supplies for a brand-new score (caller-supplied
 * id). The entity DERIVES `totalScore`, `weight` and `confirmedAt` — they are
 * NOT accepted ready (see {@link EvaluationScore.create}). There is no `now`
 * argument: a fresh score carries no creation stamp (§12 defines none) and is
 * unconfirmed.
 */
export interface EvaluationScoreCreateProps {
  id: string;
  roomId: string;
  targetTeamId: string;
  evaluatorType: EvaluatorType;
  /** Set for a TEAM score, `null` for a HOST score (cross-field invariant). */
  evaluatorTeamId: string | null;
  /** Set for a HOST score, `null` for a TEAM score (cross-field invariant). */
  hostId: string | null;
  topicScore: number;
  designScore: number;
}

/** Full persisted state used to rehydrate a score from the database. */
export interface EvaluationScoreReconstituteProps {
  id: string;
  roomId: string;
  targetTeamId: string;
  evaluatorType: EvaluatorType;
  evaluatorTeamId: string | null;
  hostId: string | null;
  topicScore: number;
  designScore: number;
  totalScore: number;
  weight: number;
  confirmedAt: Date | null;
}

/**
 * One evaluator's score for one team (plan §12, §14.10). An evaluator is either
 * a TEAM (a captain's vote, `evaluatorTeamId` set / `hostId` null, weight 1) or
 * the HOST (`hostId` set / `evaluatorTeamId` null, weight 2). `totalScore` is the
 * sum of the two criterion scores; `weight` is fixed by the evaluator type. The
 * weighted average is computed at results time (Stage 10.3) — never here.
 *
 * Like {@link Purchase} / {@link PresentationSubmission}, a near-immutable fact:
 * the only mutation is {@link confirm}, and even that is Variant A — it returns a
 * NEW frozen instance rather than mutating, so a captured score never changes
 * underfoot. {@link create} OWNS three invariants and DERIVES the rest:
 *
 * - `totalScore = topicScore + designScore` (never accepted ready);
 * - `weight = evaluatorType === 'HOST' ? 2 : 1`;
 * - the cross-field evaluator shape (TEAM ⟹ team-id, no host-id; HOST ⟹
 *   host-id, no team-id), else {@link InvalidEvaluatorError};
 * - the self-evaluation backstop (a TEAM whose `evaluatorTeamId` equals its
 *   `targetTeamId` is rejected) — the SECOND rampart behind the use case's
 *   {@link SelfEvaluationError}, since no DB constraint forbids self-eval.
 */
export class EvaluationScore {
  private constructor(
    private readonly _id: string,
    private readonly _roomId: string,
    private readonly _targetTeamId: string,
    private readonly _evaluatorType: EvaluatorType,
    private readonly _evaluatorTeamId: string | null,
    private readonly _hostId: string | null,
    private readonly _topicScore: number,
    private readonly _designScore: number,
    private readonly _totalScore: number,
    private readonly _weight: number,
    private readonly _confirmedAt: Date | null,
  ) {}

  /**
   * Record a fresh, unconfirmed score: derive `totalScore` and `weight`, assert
   * the evaluator shape and the no-self-eval rule. No `now` — a score has no
   * creation stamp and starts with `confirmedAt = null`.
   */
  static create(props: EvaluationScoreCreateProps): EvaluationScore {
    const teamShaped = props.evaluatorTeamId !== null && props.hostId === null;
    const hostShaped = props.evaluatorTeamId === null && props.hostId !== null;
    if (props.evaluatorType === 'TEAM' && !teamShaped) {
      throw new InvalidEvaluatorError();
    }
    if (props.evaluatorType === 'HOST' && !hostShaped) {
      throw new InvalidEvaluatorError();
    }
    // Self-evaluation backstop: a captain may never score their own team.
    if (
      props.evaluatorType === 'TEAM' &&
      props.evaluatorTeamId === props.targetTeamId
    ) {
      throw new InvalidEvaluatorError();
    }

    const totalScore = props.topicScore + props.designScore;
    const weight = props.evaluatorType === 'HOST' ? 2 : 1;
    return new EvaluationScore(
      props.id,
      props.roomId,
      props.targetTeamId,
      props.evaluatorType,
      props.evaluatorTeamId,
      props.hostId,
      props.topicScore,
      props.designScore,
      totalScore,
      weight,
      null,
    );
  }

  /** Rehydrate a score from persisted state (used by the mapper) — no derivation. */
  static reconstitute(
    props: EvaluationScoreReconstituteProps,
  ): EvaluationScore {
    return new EvaluationScore(
      props.id,
      props.roomId,
      props.targetTeamId,
      props.evaluatorType,
      props.evaluatorTeamId,
      props.hostId,
      props.topicScore,
      props.designScore,
      props.totalScore,
      props.weight,
      props.confirmedAt,
    );
  }

  /**
   * Confirm the score at `now` (§14.10) — Variant A: returns a NEW instance with
   * `confirmedAt` set, leaving this one untouched. Confirmation is immutable: a
   * second confirm throws {@link EvaluationAlreadyConfirmedError}.
   */
  confirm(now: Date): EvaluationScore {
    if (this._confirmedAt !== null) {
      throw new EvaluationAlreadyConfirmedError();
    }
    return new EvaluationScore(
      this._id,
      this._roomId,
      this._targetTeamId,
      this._evaluatorType,
      this._evaluatorTeamId,
      this._hostId,
      this._topicScore,
      this._designScore,
      this._totalScore,
      this._weight,
      now,
    );
  }

  get id(): string {
    return this._id;
  }

  get roomId(): string {
    return this._roomId;
  }

  get targetTeamId(): string {
    return this._targetTeamId;
  }

  get evaluatorType(): EvaluatorType {
    return this._evaluatorType;
  }

  get evaluatorTeamId(): string | null {
    return this._evaluatorTeamId;
  }

  get hostId(): string | null {
    return this._hostId;
  }

  get topicScore(): number {
    return this._topicScore;
  }

  get designScore(): number {
    return this._designScore;
  }

  get totalScore(): number {
    return this._totalScore;
  }

  get weight(): number {
    return this._weight;
  }

  get confirmedAt(): Date | null {
    return this._confirmedAt;
  }
}

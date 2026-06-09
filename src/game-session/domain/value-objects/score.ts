import { InvalidScoreError } from '../errors';

/**
 * A non-negative integer score, used for both `earnedScore` and `balance`.
 * Deliberately carries NO arithmetic in 5.1 — scoring rules (plan §14.7) arrive
 * with the gameplay sub-stages; this value object only guards the invariant
 * (integer, ≥ 0).
 */
export class Score {
  private constructor(private readonly _value: number) {}

  static create(raw: number): Score {
    if (!Number.isInteger(raw)) {
      throw new InvalidScoreError('Score must be an integer.');
    }
    if (raw < 0) {
      throw new InvalidScoreError('Score must not be negative.');
    }
    return new Score(raw);
  }

  static fromPersistence(raw: number): Score {
    return Score.create(raw);
  }

  get value(): number {
    return this._value;
  }

  equals(other: Score): boolean {
    return other instanceof Score && other._value === this._value;
  }
}

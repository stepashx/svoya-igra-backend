import { InvalidScoreError } from '../errors';

/**
 * A non-negative integer score, used for both `earnedScore` and `balance`.
 * Guards the invariant (integer, ≥ 0) and carries the §14.7 scoring addition:
 * {@link add} returns a NEW Score increased by a non-negative integer amount.
 * Subtraction (purchases §14.7) arrives with the Stage 8 `DebitBalance`.
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

  /**
   * Immutable addition: a new Score grown by `amount` (integer, ≥ 0 — a zero
   * amount is neutral arithmetic; forbidding zero AWARDS is a Team-level rule).
   */
  add(amount: number): Score {
    if (!Number.isInteger(amount)) {
      throw new InvalidScoreError('Score amount must be an integer.');
    }
    if (amount < 0) {
      throw new InvalidScoreError('Score amount must not be negative.');
    }
    return Score.create(this._value + amount);
  }

  get value(): number {
    return this._value;
  }

  equals(other: Score): boolean {
    return other instanceof Score && other._value === this._value;
  }
}

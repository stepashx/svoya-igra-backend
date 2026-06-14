import { InvalidScoreError } from '../errors';

/**
 * A non-negative integer score, used for both `earnedScore` and `balance`.
 * Guards the invariant (integer, ≥ 0) and carries the §14.7 scoring
 * arithmetic: {@link add} returns a NEW Score increased by a non-negative
 * integer amount; {@link subtract} returns a NEW Score decreased by one
 * (purchases §14.7 — the result must stay ≥ 0).
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

  /**
   * Immutable subtraction: a new Score shrunk by `amount` (integer, ≥ 0 — a
   * zero amount is neutral arithmetic; forbidding zero DEBITS is a Team-level
   * rule). Pure arithmetic on the non-negative invariant: a result below zero
   * is rejected by {@link create} as an {@link InvalidScoreError} — checking
   * affordability first is a Team-level concern ({@link Team.debitBalance}).
   */
  subtract(amount: number): Score {
    if (!Number.isInteger(amount)) {
      throw new InvalidScoreError('Score amount must be an integer.');
    }
    if (amount < 0) {
      throw new InvalidScoreError('Score amount must not be negative.');
    }
    return Score.create(this._value - amount);
  }

  get value(): number {
    return this._value;
  }

  equals(other: Score): boolean {
    return other instanceof Score && other._value === this._value;
  }
}

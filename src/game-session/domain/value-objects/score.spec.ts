import { InvalidScoreError } from '../errors';
import { Score } from './score';

describe('Score', () => {
  it('accepts zero and positive integers', () => {
    expect(Score.create(0).value).toBe(0);
    expect(Score.create(800).value).toBe(800);
  });

  it('rejects negative values', () => {
    expect(() => Score.create(-1)).toThrow(InvalidScoreError);
  });

  it('rejects non-integer values', () => {
    expect(() => Score.create(1.5)).toThrow(InvalidScoreError);
  });

  it('compares by value with equals', () => {
    expect(Score.create(100).equals(Score.create(100))).toBe(true);
    expect(Score.create(100).equals(Score.create(200))).toBe(false);
  });

  describe('add (§14.7 scoring arithmetic)', () => {
    it('sums the amount into a new Score', () => {
      expect(Score.create(100).add(300).value).toBe(400);
    });

    it('is immutable: the original keeps its value, the result is a new instance', () => {
      const original = Score.create(100);
      const grown = original.add(300);
      expect(original.value).toBe(100);
      expect(grown).not.toBe(original);
      expect(grown.value).toBe(400);
    });

    it('allows a zero amount (neutral arithmetic)', () => {
      expect(Score.create(100).add(0).value).toBe(100);
    });

    it('rejects a negative amount', () => {
      expect(() => Score.create(100).add(-1)).toThrow(InvalidScoreError);
    });

    it('rejects a non-integer amount', () => {
      expect(() => Score.create(100).add(1.5)).toThrow(InvalidScoreError);
    });
  });

  describe('subtract (§14.7 purchase arithmetic)', () => {
    it('subtracts the amount into a new Score', () => {
      expect(Score.create(300).subtract(100).value).toBe(200);
    });

    it('is immutable: the original keeps its value, the result is a new instance', () => {
      const original = Score.create(300);
      const shrunk = original.subtract(100);
      expect(original.value).toBe(300);
      expect(shrunk).not.toBe(original);
      expect(shrunk.value).toBe(200);
    });

    it('allows a zero amount (neutral arithmetic)', () => {
      expect(Score.create(100).subtract(0).value).toBe(100);
    });

    it('rejects a negative amount', () => {
      expect(() => Score.create(100).subtract(-1)).toThrow(InvalidScoreError);
    });

    it('rejects a non-integer amount', () => {
      expect(() => Score.create(100).subtract(1.5)).toThrow(InvalidScoreError);
    });

    it('rejects a subtraction below zero (non-negative invariant)', () => {
      expect(() => Score.create(100).subtract(101)).toThrow(InvalidScoreError);
    });
  });
});

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
});

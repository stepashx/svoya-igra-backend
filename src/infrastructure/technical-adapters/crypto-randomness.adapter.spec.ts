import { CryptoRandomnessAdapter } from './crypto-randomness.adapter';

describe('CryptoRandomnessAdapter', () => {
  const rng = new CryptoRandomnessAdapter();

  it('throws when picking from an empty list', () => {
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('always picks an element that is in the list', () => {
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i += 1) {
      expect(items).toContain(rng.pick(items));
    }
  });

  it('eventually picks every element (uniform coverage)', () => {
    const items = [1, 2, 3];
    const seen = new Set<number>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(rng.pick(items));
    }
    expect(seen).toEqual(new Set(items));
  });

  it('shuffles into a permutation without mutating the input', () => {
    const items = [1, 2, 3, 4, 5];
    const original = [...items];
    const shuffled = rng.shuffle(items);

    expect(shuffled).toHaveLength(items.length);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(original);
    expect(items).toEqual(original);
  });
});

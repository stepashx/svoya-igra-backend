import { InvalidPlayerNameError } from '../errors';
import { PlayerName } from './player-name';

describe('PlayerName', () => {
  it('trims surrounding whitespace', () => {
    expect(PlayerName.create('  Alice  ').value).toBe('Alice');
  });

  it('rejects empty or whitespace-only names', () => {
    expect(() => PlayerName.create('')).toThrow(InvalidPlayerNameError);
    expect(() => PlayerName.create('   ')).toThrow(InvalidPlayerNameError);
  });

  it('rejects names longer than 50 characters', () => {
    expect(() => PlayerName.create('a'.repeat(51))).toThrow(
      InvalidPlayerNameError,
    );
  });

  it('accepts a name at the 50-character boundary', () => {
    expect(PlayerName.create('a'.repeat(50)).value).toHaveLength(50);
  });

  it('compares by value with equals', () => {
    expect(PlayerName.create('Bob').equals(PlayerName.create('Bob'))).toBe(
      true,
    );
    expect(PlayerName.create('Bob').equals(PlayerName.create('Sue'))).toBe(
      false,
    );
  });
});

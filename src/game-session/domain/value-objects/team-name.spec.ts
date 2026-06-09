import { InvalidTeamNameError } from '../errors';
import { TeamName } from './team-name';

describe('TeamName', () => {
  it('trims surrounding whitespace', () => {
    expect(TeamName.create('  Red Team  ').value).toBe('Red Team');
  });

  it('rejects empty or whitespace-only names', () => {
    expect(() => TeamName.create('')).toThrow(InvalidTeamNameError);
    expect(() => TeamName.create('   ')).toThrow(InvalidTeamNameError);
  });

  it('rejects names longer than 50 characters', () => {
    expect(() => TeamName.create('a'.repeat(51))).toThrow(InvalidTeamNameError);
  });

  it('compares by value with equals', () => {
    expect(TeamName.create('Red').equals(TeamName.create('Red'))).toBe(true);
    expect(TeamName.create('Red').equals(TeamName.create('Blue'))).toBe(false);
  });
});

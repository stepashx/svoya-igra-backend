import { InvalidTeamNameError } from '../errors';

/** Maximum team-name length (characters), after trimming. */
const MAX_TEAM_NAME_LENGTH = 50;

/**
 * Team display name. Trimmed of surrounding whitespace, must be non-empty and
 * at most {@link MAX_TEAM_NAME_LENGTH} characters.
 */
export class TeamName {
  private constructor(private readonly _value: string) {}

  static create(raw: string): TeamName {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new InvalidTeamNameError('Team name must not be empty.');
    }
    if (trimmed.length > MAX_TEAM_NAME_LENGTH) {
      throw new InvalidTeamNameError(
        `Team name must be at most ${MAX_TEAM_NAME_LENGTH} characters.`,
      );
    }
    return new TeamName(trimmed);
  }

  static fromPersistence(raw: string): TeamName {
    return TeamName.create(raw);
  }

  get value(): string {
    return this._value;
  }

  equals(other: TeamName): boolean {
    return other instanceof TeamName && other._value === this._value;
  }
}

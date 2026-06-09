import { InvalidPlayerNameError } from '../errors';

/** Maximum player-name length (characters), after trimming. */
const MAX_PLAYER_NAME_LENGTH = 50;

/**
 * Player display name. Trimmed of surrounding whitespace, must be non-empty and
 * at most {@link MAX_PLAYER_NAME_LENGTH} characters.
 */
export class PlayerName {
  private constructor(private readonly _value: string) {}

  static create(raw: string): PlayerName {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new InvalidPlayerNameError('Player name must not be empty.');
    }
    if (trimmed.length > MAX_PLAYER_NAME_LENGTH) {
      throw new InvalidPlayerNameError(
        `Player name must be at most ${MAX_PLAYER_NAME_LENGTH} characters.`,
      );
    }
    return new PlayerName(trimmed);
  }

  static fromPersistence(raw: string): PlayerName {
    return PlayerName.create(raw);
  }

  get value(): string {
    return this._value;
  }

  equals(other: PlayerName): boolean {
    return other instanceof PlayerName && other._value === this._value;
  }
}

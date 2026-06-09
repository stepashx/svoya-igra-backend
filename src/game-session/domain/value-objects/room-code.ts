import { InvalidRoomCodeError } from '../errors';

/**
 * Human-enterable room code. Same alphabet as the crypto token generator —
 * upper-case letters and digits with visually ambiguous characters (I, O, 0, 1)
 * removed. Codes are normalised to upper case; length is NOT constrained here
 * (the generator decides it from config).
 */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_CHARS: ReadonlySet<string> = new Set(ROOM_CODE_ALPHABET);

export class RoomCode {
  private constructor(private readonly _value: string) {}

  static create(raw: string): RoomCode {
    const normalized = raw.trim().toUpperCase();
    if (normalized.length === 0) {
      throw new InvalidRoomCodeError('Room code must not be empty.');
    }
    for (const char of normalized) {
      if (!ROOM_CODE_CHARS.has(char)) {
        throw new InvalidRoomCodeError(
          `Room code contains an unsupported character: "${char}".`,
        );
      }
    }
    return new RoomCode(normalized);
  }

  static fromPersistence(raw: string): RoomCode {
    return RoomCode.create(raw);
  }

  get value(): string {
    return this._value;
  }

  equals(other: RoomCode): boolean {
    return other instanceof RoomCode && other._value === this._value;
  }
}

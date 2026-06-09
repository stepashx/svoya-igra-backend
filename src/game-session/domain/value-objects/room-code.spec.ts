import { InvalidRoomCodeError } from '../errors';
import { RoomCode } from './room-code';

describe('RoomCode', () => {
  it('normalizes to upper case and trims', () => {
    expect(RoomCode.create('  abcde  ').value).toBe('ABCDE');
  });

  it('rejects an empty or whitespace-only code', () => {
    expect(() => RoomCode.create('')).toThrow(InvalidRoomCodeError);
    expect(() => RoomCode.create('   ')).toThrow(InvalidRoomCodeError);
  });

  it('rejects characters outside the alphabet (0, 1, I, O excluded)', () => {
    expect(() => RoomCode.create('ABCD0')).toThrow(InvalidRoomCodeError);
    expect(() => RoomCode.create('ABCD1')).toThrow(InvalidRoomCodeError);
    expect(() => RoomCode.create('ABC#E')).toThrow(InvalidRoomCodeError);
  });

  it('reconstitutes a valid code from persistence', () => {
    expect(RoomCode.fromPersistence('XYZ23').value).toBe('XYZ23');
  });

  it('compares by normalized value with equals', () => {
    expect(RoomCode.create('abcde').equals(RoomCode.create('ABCDE'))).toBe(
      true,
    );
    expect(RoomCode.create('abcde').equals(RoomCode.create('FGHJK'))).toBe(
      false,
    );
  });
});

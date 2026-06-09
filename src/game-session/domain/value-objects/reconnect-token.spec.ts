import { InvalidReconnectTokenError } from '../errors';
import { ReconnectToken } from './reconnect-token';

describe('ReconnectToken', () => {
  it('accepts a non-empty URL-safe base64 token', () => {
    expect(ReconnectToken.create('abcDEF123_-').value).toBe('abcDEF123_-');
  });

  it('rejects an empty token', () => {
    expect(() => ReconnectToken.create('')).toThrow(InvalidReconnectTokenError);
  });

  it('rejects non-URL-safe characters', () => {
    expect(() => ReconnectToken.create('has space')).toThrow(
      InvalidReconnectTokenError,
    );
    expect(() => ReconnectToken.create('plus+slash/')).toThrow(
      InvalidReconnectTokenError,
    );
  });

  it('compares by value with equals', () => {
    expect(
      ReconnectToken.create('tok').equals(ReconnectToken.create('tok')),
    ).toBe(true);
    expect(
      ReconnectToken.create('tok').equals(ReconnectToken.create('other')),
    ).toBe(false);
  });
});

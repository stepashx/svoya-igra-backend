import { InvalidReconnectTokenError } from '../errors';

/**
 * Opaque reconnect / host-identity token. Validated as a non-empty, URL-safe
 * base64 string (the charset produced by `randomBytes(...).toString('base64url')`
 * in the crypto token generator). Treated as opaque — never trimmed or
 * re-cased.
 */
const URL_SAFE_BASE64 = /^[A-Za-z0-9_-]+$/;

export class ReconnectToken {
  private constructor(private readonly _value: string) {}

  static create(raw: string): ReconnectToken {
    if (raw.length === 0) {
      throw new InvalidReconnectTokenError(
        'Reconnect token must not be empty.',
      );
    }
    if (!URL_SAFE_BASE64.test(raw)) {
      throw new InvalidReconnectTokenError(
        'Reconnect token must be a URL-safe base64 string.',
      );
    }
    return new ReconnectToken(raw);
  }

  static fromPersistence(raw: string): ReconnectToken {
    return ReconnectToken.create(raw);
  }

  get value(): string {
    return this._value;
  }

  equals(other: ReconnectToken): boolean {
    return other instanceof ReconnectToken && other._value === this._value;
  }
}

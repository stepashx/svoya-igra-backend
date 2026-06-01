/**
 * Abstraction over opaque token / code generation (room codes, host and
 * player reconnect tokens). Consumers arrive in later feature stages.
 */
export interface TokenGeneratorPort {
  /** An opaque, URL-safe reconnect/identity token. */
  generateToken(): string;

  /** A short human-enterable room code of the given length. */
  generateRoomCode(length: number): string;
}

export const TOKEN_GENERATOR_PORT = Symbol('TokenGeneratorPort');

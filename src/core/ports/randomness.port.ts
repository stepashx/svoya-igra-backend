/**
 * Abstraction over randomness so use cases (random first team, turn order,
 * topic auto-assignment) stay deterministic in tests. Implemented by an
 * infrastructure adapter; the domain/application layers never call
 * `Math.random` or `node:crypto` directly.
 */
export interface RandomGeneratorPort {
  /** Pick one element uniformly at random. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;

  /** Return a new array with the elements in a uniformly random order. */
  shuffle<T>(items: readonly T[]): T[];
}

export const RANDOM_GENERATOR_PORT = Symbol('RandomGeneratorPort');

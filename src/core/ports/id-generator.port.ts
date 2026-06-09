/**
 * Abstraction over application-side identifier generation. Aggregates receive
 * a ready-made id from the use case (which calls this port) rather than reaching
 * for `node:crypto` themselves, keeping the domain free of infrastructure.
 * Implemented by an infrastructure adapter.
 */
export interface IdGeneratorPort {
  /** A fresh, globally-unique identifier (UUID v4 in the default adapter). */
  generate(): string;
}

export const ID_GENERATOR_PORT = Symbol('IdGeneratorPort');

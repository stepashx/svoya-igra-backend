/**
 * Schema barrel — the single entry point the Drizzle client is built on.
 * `database.types.ts` and `database.providers.ts` import this as `* as schema`
 * to type and register the client. Re-exports every table (16 across five
 * feature areas) plus the shared enum unions.
 *
 * Import graph is acyclic: `_shared ← game-session ← {gameplay, commerce,
 * presentation, evaluation}`. Domain/application never import from here —
 * Drizzle types stay inside infrastructure.
 */
export * from './_shared/enums';
export * from './game-session';
export * from './gameplay';
export * from './commerce';
export * from './presentation';
export * from './evaluation';

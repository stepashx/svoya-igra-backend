/**
 * Single entry point for the Drizzle schema. Everything the data layer exposes —
 * shared enum/status vocabulary, column conventions, and (in later sub-stages)
 * the feature-area tables — is re-exported here so callers import from one
 * place: `import { ... } from '../database/schema'`.
 *
 * This barrel is also what gets registered with the Drizzle client
 * (`database.providers.ts`), so newly added tables are picked up automatically.
 * Feature areas are placeholders in Stage 5A.1 and contribute no tables yet.
 */
export * from './shared';
export * from './game-session';
export * from './gameplay';
export * from './commerce';
export * from './presentation';
export * from './evaluation';

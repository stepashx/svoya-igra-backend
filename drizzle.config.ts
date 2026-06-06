/**
 * Drizzle Kit configuration (Stage 5A.5) — migration generation + application.
 *
 * This file is build/CLI tooling, not application runtime code, so it is the one
 * place allowed to read `process.env` directly (the typed Config module governs
 * the running app, not the standalone `drizzle-kit` CLI). `dotenv/config` loads
 * the local `.env` so `DATABASE_URL` resolves the same way the app sees it.
 *
 * - `schema` points at the single schema barrel, so every feature-area table is
 *   picked up automatically.
 * - `out` keeps generated SQL + the migration journal inside Infrastructure,
 *   which owns the Drizzle schema and migrations.
 */
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env (or export it) before running drizzle-kit.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema/index.ts',
  out: './src/infrastructure/database/migrations',
  dbCredentials: { url: databaseUrl },
  // Fail on ambiguous renames instead of silently guessing, and print the SQL
  // being applied — both helpful for a student team reviewing migrations.
  strict: true,
  verbose: true,
});

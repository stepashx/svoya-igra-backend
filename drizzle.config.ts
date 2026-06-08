import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration — migrations only (`db:generate` / `db:migrate` /
 * `db:check`).
 *
 * This is the ONE sanctioned read of `process.env` outside the Config module:
 * drizzle-kit runs as a standalone CLI before Nest's DI (and AppConfigService)
 * exist, so it loads `DATABASE_URL` from `.env` via `dotenv/config` directly.
 * Only `db:migrate` / `db:check` actually connect; `db:generate` is offline.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema/index.ts',
  out: './src/infrastructure/database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
  strict: true,
  verbose: true,
});

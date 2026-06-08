import { Logger, Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfigService } from '../../config/app-config.service';
import { DATABASE_POOL, DRIZZLE } from './database.constants';
import * as schema from './schema';

/**
 * Connection seam for PostgreSQL + Drizzle. The pool is created lazily by
 * node-postgres, so the app still boots when the database is unreachable; the
 * Health module surfaces connectivity. The Drizzle client is registered with
 * the full schema (Stage 4) so it is table-aware.
 */
export const databaseProviders: Provider[] = [
  {
    provide: DATABASE_POOL,
    inject: [AppConfigService],
    useFactory: (config: AppConfigService): Pool => {
      const pool = new Pool({ connectionString: config.database.url });
      // Idle clients can emit 'error' (e.g. Postgres restart). Without a
      // listener the EventEmitter would rethrow and crash the process; log only.
      const logger = new Logger('DatabasePool');
      pool.on('error', (error) =>
        logger.error('Idle PostgreSQL client error', error.stack),
      );
      return pool;
    },
  },
  {
    provide: DRIZZLE,
    inject: [DATABASE_POOL],
    useFactory: (pool: Pool) => drizzle(pool, { schema }),
  },
];

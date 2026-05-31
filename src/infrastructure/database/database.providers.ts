import { Provider } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfigService } from '../../config/app-config.service';
import { DATABASE_POOL, DRIZZLE } from './database.constants';

/**
 * Connection seam for PostgreSQL + Drizzle. The pool is created lazily by
 * node-postgres, so the app still boots when the database is unreachable; the
 * Health module surfaces connectivity. No schema is registered yet (Stage 5A).
 */
export const databaseProviders: Provider[] = [
  {
    provide: DATABASE_POOL,
    inject: [AppConfigService],
    useFactory: (config: AppConfigService): Pool =>
      new Pool({ connectionString: config.database.url }),
  },
  {
    provide: DRIZZLE,
    inject: [DATABASE_POOL],
    useFactory: (pool: Pool) => drizzle(pool),
  },
];

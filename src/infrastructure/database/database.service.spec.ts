import { Pool } from 'pg';
import { DatabaseService } from './database.service';
import { DrizzleDatabase } from './database.types';

describe('DatabaseService', () => {
  const makeService = () => {
    const pool = {
      query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
      end: jest.fn().mockResolvedValue(undefined),
    };
    const drizzle = {
      transaction: jest.fn((work: (tx: unknown) => Promise<unknown>) =>
        work({} as unknown),
      ),
    };
    const service = new DatabaseService(
      pool as unknown as Pool,
      drizzle as unknown as DrizzleDatabase,
    );
    return { service, pool, drizzle };
  };

  it('exposes the Drizzle client via db', () => {
    const { service, drizzle } = makeService();
    expect(service.db).toBe(drizzle);
  });

  it('probes connectivity with SELECT 1', async () => {
    const { service, pool } = makeService();
    await service.checkConnection();
    expect(pool.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('delegates transaction() to the Drizzle client', async () => {
    const { service, drizzle } = makeService();
    const work = jest.fn().mockResolvedValue('done');

    const result = await service.transaction(work);

    expect(drizzle.transaction).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(1);
    expect(result).toBe('done');
  });

  it('ends the pool on shutdown', async () => {
    const { service, pool } = makeService();
    await service.onModuleDestroy();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});

import { HealthService } from './health.service';
import { DatabaseService } from '../infrastructure/database/database.service';
import { StorageService } from '../infrastructure/storage/storage.service';

describe('HealthService', () => {
  const makeService = (db: () => Promise<void>, storage: () => Promise<void>) =>
    new HealthService(
      { checkConnection: db } as unknown as DatabaseService,
      { checkConnection: storage } as unknown as StorageService,
    );

  it('reports ok when all dependencies are healthy', async () => {
    const service = makeService(
      () => Promise.resolve(),
      () => Promise.resolve(),
    );

    const report = await service.check();

    expect(report.status).toBe('ok');
    expect(report.checks).toEqual({
      backend: { status: 'ok' },
      database: { status: 'ok' },
      storage: { status: 'ok' },
    });
    expect(typeof report.timestamp).toBe('string');
  });

  it('reports error and captures a reason when the database check fails', async () => {
    const service = makeService(
      () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:5432')),
      () => Promise.resolve(),
    );

    const report = await service.check();

    expect(report.status).toBe('error');
    expect(report.checks.database).toEqual({
      status: 'error',
      error: 'connect ECONNREFUSED 127.0.0.1:5432',
    });
    expect(report.checks.storage.status).toBe('ok');
    expect(report.checks.backend.status).toBe('ok');
  });

  it('reports error when the storage check fails', async () => {
    const service = makeService(
      () => Promise.resolve(),
      () =>
        Promise.reject(new Error('MinIO bucket "svoya-igra" does not exist')),
    );

    const report = await service.check();

    expect(report.status).toBe('error');
    expect(report.checks.storage.status).toBe('error');
    expect(report.checks.database.status).toBe('ok');
  });
});

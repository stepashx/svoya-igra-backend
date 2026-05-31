import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { HealthController } from './health.controller';
import { HealthReport, HealthService } from './health.service';

describe('HealthController', () => {
  const makeResponse = () => {
    const res = { status: jest.fn() } as unknown as Response;
    return res;
  };

  const makeController = (report: HealthReport) => {
    const health = { check: () => Promise.resolve(report) } as HealthService;
    return new HealthController(health);
  };

  it('returns the report with 200 when healthy', async () => {
    const report: HealthReport = {
      status: 'ok',
      checks: {
        backend: { status: 'ok' },
        database: { status: 'ok' },
        storage: { status: 'ok' },
      },
      timestamp: new Date().toISOString(),
    };
    const controller = makeController(report);
    const res = makeResponse();

    const result = await controller.check(res);

    expect(result).toBe(report);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('returns 503 when a dependency is unhealthy', async () => {
    const report: HealthReport = {
      status: 'error',
      checks: {
        backend: { status: 'ok' },
        database: { status: 'error', error: 'connect ECONNREFUSED' },
        storage: { status: 'ok' },
      },
      timestamp: new Date().toISOString(),
    };
    const controller = makeController(report);
    const res = makeResponse();

    await controller.check(res);

    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});

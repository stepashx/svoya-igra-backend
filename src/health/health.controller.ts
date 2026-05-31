import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { HealthReport, HealthService } from './health.service';

/**
 * Health endpoint: backend liveness plus PostgreSQL and MinIO reachability.
 * Returns 200 when all checks pass, 503 when any dependency is unhealthy.
 * Thin transport only — the checks live in HealthService.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthReport> {
    const report = await this.health.check();
    res.status(
      report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    );
    return report;
  }
}

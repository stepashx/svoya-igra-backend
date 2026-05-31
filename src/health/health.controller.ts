import { Controller, Get } from '@nestjs/common';

/**
 * Minimal liveness endpoint to confirm the process boots and serves HTTP.
 * PostgreSQL and MinIO reachability checks are added in Stage 3B.
 */
@Controller('health')
export class HealthController {
  @Get()
  liveness() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}

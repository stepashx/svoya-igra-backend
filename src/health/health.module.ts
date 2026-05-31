import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

/**
 * Health area. Depends on Infrastructure for the database and storage probes;
 * holds no business state.
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}

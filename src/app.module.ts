import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { HealthModule } from './health/health.module';
import { RealtimeModule } from './realtime/realtime.module';
import { GameSessionModule } from './game-session/game-session.module';
import { GameplayModule } from './gameplay/gameplay.module';
import { CommerceModule } from './commerce/commerce.module';
import { PresentationModule } from './presentation/presentation.module';
import { EvaluationModule } from './evaluation/evaluation.module';

/**
 * Root module wiring the compact feature areas together. Future feature areas
 * are imported as empty shells so the structure is visible from the start.
 */
@Module({
  imports: [
    AppConfigModule,
    InfrastructureModule,
    HealthModule,
    RealtimeModule,
    // Future feature areas (placeholder shells — no logic yet)
    GameSessionModule,
    GameplayModule,
    CommerceModule,
    PresentationModule,
    EvaluationModule,
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';

/**
 * Game Session feature area — placeholder shell only (Stage 3A).
 *
 * Later (Stage 5B): rooms, opaque host identity, players, reconnect tokens,
 * teams, captain assignment, topic selection, readiness, and the
 * GameSessionRepositoryAdapter. No domain, application, or persistence logic
 * exists yet. Internal layering will be domain / application / presentation.
 */
@Module({})
export class GameSessionModule {}

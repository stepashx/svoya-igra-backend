import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import {
  PLAYER_REPOSITORY_PORT,
  ROOM_REPOSITORY_PORT,
  TEAM_REPOSITORY_PORT,
  TOPIC_REPOSITORY_PORT,
} from './domain/ports';
import {
  DrizzlePlayerRepository,
  DrizzleRoomRepository,
  DrizzleTeamRepository,
  DrizzleTopicRepository,
} from './infrastructure/persistence';
import {
  GameController,
  PlayersController,
  RoomsController,
  TeamsController,
  TopicsController,
} from './presentation/controllers';

/**
 * Game Session feature area. Internal layering: domain / application /
 * infrastructure / presentation.
 *
 * Sub-stage 5.1 ships the persistence skeleton and lobby domain only: entities,
 * value objects, the four repository ports and their Drizzle adapters, and 501
 * controller stubs. Lobby use cases, host-auth, WebSocket emission and real DTOs
 * arrive in 5.2.
 *
 * Persistence is FOUR separate repositories per Этап2 §15
 * (Room / Player / Team / Topic), each its own port + Drizzle adapter — not the
 * single `GameSessionRepositoryAdapter` the old Stage 3A placeholder described.
 */
@Module({
  imports: [InfrastructureModule],
  controllers: [
    RoomsController,
    PlayersController,
    TeamsController,
    TopicsController,
    GameController,
  ],
  providers: [
    { provide: ROOM_REPOSITORY_PORT, useClass: DrizzleRoomRepository },
    { provide: PLAYER_REPOSITORY_PORT, useClass: DrizzlePlayerRepository },
    { provide: TEAM_REPOSITORY_PORT, useClass: DrizzleTeamRepository },
    { provide: TOPIC_REPOSITORY_PORT, useClass: DrizzleTopicRepository },
  ],
  exports: [],
})
export class GameSessionModule {}

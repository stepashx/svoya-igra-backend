import { Module } from '@nestjs/common';
import { GameplayModule } from '../gameplay/gameplay.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TRANSACTION_PORT } from './application/ports';
import {
  LobbyQueryService,
  RoomSnapshotAssembler,
} from './application/queries';
import {
  CloseRoomUseCase,
  CreateRoomUseCase,
  CreateTeamUseCase,
  JoinRoomUseCase,
  JoinTeamUseCase,
  LeaveTeamUseCase,
  MarkClientDisconnectedUseCase,
  MarkTeamReadyUseCase,
  ReconnectClientUseCase,
  SelectTopicUseCase,
  StartGameUseCase,
  UpdateProfileUseCase,
} from './application/use-cases';
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
  DrizzleTransactionAdapter,
} from './infrastructure/persistence';
import {
  GameController,
  PlayersController,
  RoomsController,
  TeamsController,
  TopicsController,
} from './presentation/controllers';
import { HostAuthGuard, PlayerIdentityGuard } from './presentation/http';
import {
  GameSessionGateway,
  LobbyPresenceRegistry,
  SocketIdentityResolver,
} from './presentation/ws';

/**
 * Game Session feature area. Internal layering: domain / application /
 * infrastructure / presentation.
 *
 * Sub-stage 5.2a wires the lobby use cases, the read-model queries, the
 * transactional boundary adapter, and the host/player route guards on top of the
 * 5.1 persistence skeleton. Use cases broadcast room-wide events through the
 * RealtimeEventsPort (imported from {@link RealtimeModule}); the four
 * repositories are transaction-aware via the shared TransactionContext.
 *
 * Sub-stage 5.2b adds the WebSocket side of reconnect: the
 * {@link GameSessionGateway} (a second gateway on the shared io server), the
 * in-memory {@link LobbyPresenceRegistry}, the {@link SocketIdentityResolver},
 * and {@link MarkClientDisconnectedUseCase}. Game mutations stay REST.
 *
 * Sub-stage 6.1 imports {@link GameplayModule} for the board-init seam: it
 * exports the BOARD_INITIALIZATION_PORT that StartGame invokes after the room
 * reaches GAME_BOARD.
 */
@Module({
  imports: [InfrastructureModule, RealtimeModule, GameplayModule],
  controllers: [
    RoomsController,
    PlayersController,
    TeamsController,
    TopicsController,
    GameController,
  ],
  providers: [
    // Persistence ports → Drizzle adapters.
    { provide: ROOM_REPOSITORY_PORT, useClass: DrizzleRoomRepository },
    { provide: PLAYER_REPOSITORY_PORT, useClass: DrizzlePlayerRepository },
    { provide: TEAM_REPOSITORY_PORT, useClass: DrizzleTeamRepository },
    { provide: TOPIC_REPOSITORY_PORT, useClass: DrizzleTopicRepository },
    { provide: TRANSACTION_PORT, useClass: DrizzleTransactionAdapter },
    // Lobby use cases.
    CreateRoomUseCase,
    JoinRoomUseCase,
    ReconnectClientUseCase,
    CreateTeamUseCase,
    JoinTeamUseCase,
    LeaveTeamUseCase,
    UpdateProfileUseCase,
    SelectTopicUseCase,
    MarkTeamReadyUseCase,
    StartGameUseCase,
    CloseRoomUseCase,
    MarkClientDisconnectedUseCase,
    // Read models.
    RoomSnapshotAssembler,
    LobbyQueryService,
    // Route guards.
    HostAuthGuard,
    PlayerIdentityGuard,
    // WebSocket presence/reconnect (5.2b): a second gateway on the shared io
    // server plus its in-memory presence registry and token→identity resolver.
    GameSessionGateway,
    LobbyPresenceRegistry,
    SocketIdentityResolver,
  ],
})
export class GameSessionModule {}

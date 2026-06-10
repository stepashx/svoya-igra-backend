import { Module } from '@nestjs/common';
import { GameplayModule } from '../gameplay/gameplay.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { RealtimeModule } from '../realtime/realtime.module';
import {
  HOST_REALTIME_EVENTS_PORT,
  TRANSACTION_PORT,
} from './application/ports';
import {
  LobbyQueryService,
  RoomSnapshotAssembler,
  TimerQueryService,
} from './application/queries';
import { AnswerTimerRegistry } from './application/timers';
import {
  AdvanceOnTimeoutUseCase,
  CloseRoomUseCase,
  CreateRoomUseCase,
  CreateTeamUseCase,
  JoinRoomUseCase,
  JoinTeamUseCase,
  LeaveTeamUseCase,
  MarkClientDisconnectedUseCase,
  MarkTeamReadyUseCase,
  OpenQuestionUseCase,
  ReconnectClientUseCase,
  RejectSelectionUseCase,
  ReviewAnswerUseCase,
  SelectQuestionUseCase,
  SelectTopicUseCase,
  StartGameUseCase,
  SubmitAnswerUseCase,
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
  BoardController,
  GameController,
  PlayersController,
  QuestionsController,
  RoomsController,
  TeamsController,
  TopicsController,
} from './presentation/controllers';
import { HostAuthGuard, PlayerIdentityGuard } from './presentation/http';
import {
  GameSessionGateway,
  LobbyPresenceRegistry,
  PresenceHostRealtimeEventsAdapter,
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
 *
 * Sub-stage 6.2a adds the battle cycle (Design A — Game Flow owns the stages and
 * turn). The Board/Questions controllers and the select/open/reject/submit/
 * review/advance use cases live here and emit `server:gameplay:*` events through
 * the RealtimeEventsPort; the answer timer is the in-memory
 * {@link AnswerTimerRegistry}. The board/question read models and the three
 * repository ports they use are consumed from the imported {@link GameplayModule}.
 *
 * Sub-stage 6.2b adds host-socket delivery: the
 * {@link PresenceHostRealtimeEventsAdapter} implements the application-level
 * HOST_REALTIME_EVENTS_PORT over the module-singleton
 * {@link LobbyPresenceRegistry} (shared with the gateway), so
 * `cell-selection-requested` and the reveal-gated
 * `question-correct-answer-shown-to-host` reach only the host's live sockets.
 */
@Module({
  imports: [InfrastructureModule, RealtimeModule, GameplayModule],
  controllers: [
    RoomsController,
    PlayersController,
    TeamsController,
    TopicsController,
    GameController,
    // Battle-cycle controllers (sub-stage 6.2a; Gameplay tag).
    BoardController,
    QuestionsController,
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
    // Battle-cycle use cases + answer timer (sub-stage 6.2a). The gameplay
    // repository ports and BoardQueryService come from the imported
    // GameplayModule (Design A).
    AnswerTimerRegistry,
    SelectQuestionUseCase,
    OpenQuestionUseCase,
    RejectSelectionUseCase,
    SubmitAnswerUseCase,
    ReviewAnswerUseCase,
    AdvanceOnTimeoutUseCase,
    // Read models.
    RoomSnapshotAssembler,
    LobbyQueryService,
    TimerQueryService,
    // Route guards.
    HostAuthGuard,
    PlayerIdentityGuard,
    // WebSocket presence/reconnect (5.2b): a second gateway on the shared io
    // server plus its in-memory presence registry and token→identity resolver.
    GameSessionGateway,
    LobbyPresenceRegistry,
    SocketIdentityResolver,
    // Host-socket delivery (6.2b): presence reverse-lookup behind the
    // application-level host-events port.
    PresenceHostRealtimeEventsAdapter,
    {
      provide: HOST_REALTIME_EVENTS_PORT,
      useExisting: PresenceHostRealtimeEventsAdapter,
    },
  ],
})
export class GameSessionModule {}

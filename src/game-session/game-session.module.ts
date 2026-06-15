import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfigService } from '../config/app-config.service';
import { CommerceModule } from '../commerce/commerce.module';
import { GameplayModule } from '../gameplay/gameplay.module';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { PresentationModule } from '../presentation/presentation.module';
import { RealtimeModule } from '../realtime/realtime.module';
import {
  HOST_REALTIME_EVENTS_PORT,
  TEAM_REALTIME_EVENTS_PORT,
  TRANSACTION_PORT,
} from './application/ports';
import {
  LobbyQueryService,
  RoomSnapshotAssembler,
  TimerQueryService,
} from './application/queries';
import {
  AnswerTimerRegistry,
  PresentationTimerRegistry,
  ShopTimerRegistry,
} from './application/timers';
import {
  AdvanceOnTimeoutUseCase,
  CloseRoomUseCase,
  CloseShopUseCase,
  CreateRoomUseCase,
  CreateTeamUseCase,
  JoinRoomUseCase,
  JoinTeamUseCase,
  LeaveTeamUseCase,
  MarkClientDisconnectedUseCase,
  MarkTeamReadyUseCase,
  OpenQuestionUseCase,
  PurchaseItemUseCase,
  ReconnectClientUseCase,
  RejectSelectionUseCase,
  ReviewAnswerUseCase,
  SelectQuestionUseCase,
  SelectTopicUseCase,
  StartGameUseCase,
  StartPresentationPreparationUseCase,
  SubmitAnswerUseCase,
  UpdateProfileUseCase,
  UploadPresentationUseCase,
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
  InventoryController,
  PlayersController,
  PresentationController,
  QuestionsController,
  RoomsController,
  ShopController,
  TeamsController,
  TopicsController,
} from './presentation/controllers';
import {
  HostAuthGuard,
  PlayerIdentityGuard,
  presentationMulterOptions,
  TeamMemberOrHostGuard,
} from './presentation/http';
import {
  GameSessionGateway,
  LobbyPresenceRegistry,
  PresenceHostRealtimeEventsAdapter,
  PresenceTeamRealtimeEventsAdapter,
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
 *
 * Sub-stage 8.1 imports {@link CommerceModule} for the shop seam (the four
 * commerce repository ports, Design A — exactly as GameplayModule) and ships
 * the Shop/Inventory 501 stubs; the shop/purchase use cases arrive in 8.2/8.3.
 *
 * Sub-stage 8.2 wires the shop lifecycle: the every-6th cadence branch in
 * {@link ReviewAnswerUseCase} (emitting `shop-opened`/`shop-final-opened`),
 * the in-memory {@link ShopTimerRegistry} with its minimum-open window,
 * {@link CloseShopUseCase}, and the real shop items/round/close endpoints —
 * the catalog read model (ShopQueryService) comes from the imported
 * {@link CommerceModule}. Purchases stay 501 until 8.3.
 *
 * Sub-stage 9.1 imports {@link PresentationModule} for the presentation seam
 * (the two presentation repository ports + the requirements read model, Design
 * A — exactly as CommerceModule) and ships the {@link PresentationController}:
 * the real GET requirements plus the deadline/upload/replace/submissions/files
 * 501 stubs. The preparation timer, upload use case, and `server:presentation:*`
 * emission arrive in 9.2/9.3.
 *
 * Sub-stage 9.2 wires the preparation surface: the in-memory
 * {@link PresentationTimerRegistry} and {@link StartPresentationPreparationUseCase}
 * (the first §16.6 emitter — `preparation-started` + `timer-started`, room-wide
 * and public), plus the real GET deadline / submissions reads (the submission
 * read model comes from the imported PresentationModule). The room is already in
 * PRESENTATION_PREPARATION (the 8.2 final-shop close parked it there), so the
 * use case changes no room state. Upload/replace/files stay 501 until 9.3.
 */
@Module({
  imports: [
    InfrastructureModule,
    RealtimeModule,
    GameplayModule,
    CommerceModule,
    PresentationModule,
    // Presentation upload (9.3): in-memory multipart with a size limit and an
    // extension-only fileFilter (BadRequestException → 400). AppConfigService is
    // globally available, so the async factory injects it directly.
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: presentationMulterOptions,
    }),
  ],
  controllers: [
    RoomsController,
    PlayersController,
    TeamsController,
    TopicsController,
    GameController,
    // Battle-cycle controllers (sub-stage 6.2a; Gameplay tag).
    BoardController,
    QuestionsController,
    // Shop/inventory 501 stubs (sub-stage 8.1; Commerce tag).
    ShopController,
    InventoryController,
    // Presentation: GET requirements (9.1) + preparation deadline/submissions
    // reads and host start-preparation (9.2); upload/files 501 until 9.3.
    PresentationController,
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
    // Shop flow (sub-stage 8.2): the shop timer and the host close; the
    // catalog read model (ShopQueryService) comes from CommerceModule.
    ShopTimerRegistry,
    CloseShopUseCase,
    // Purchases + inventory (sub-stage 8.3): the captain buy; the commerce
    // repository ports it needs and the InventoryQueryService come from the
    // imported CommerceModule.
    PurchaseItemUseCase,
    // Presentation preparation (sub-stage 9.2): the in-memory preparation timer
    // and the host start; the requirement/submission reads come from the
    // imported PresentationModule (PresentationQueryService).
    PresentationTimerRegistry,
    StartPresentationPreparationUseCase,
    // Presentation upload (sub-stage 9.3): the captain's two-phase upload/replace
    // (FILE_STORAGE_PORT comes transitively from InfrastructureModule, the
    // submission port from the imported PresentationModule).
    UploadPresentationUseCase,
    // Read models.
    RoomSnapshotAssembler,
    LobbyQueryService,
    TimerQueryService,
    // Route guards.
    HostAuthGuard,
    PlayerIdentityGuard,
    // Inventory read authz (8.3): team member OR room host.
    TeamMemberOrHostGuard,
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
    // Team-socket delivery (8.3): presence reverse-lookup over the team roster
    // behind the application-level team-events port — the only channel allowed
    // to carry the QR publicUrl (`inventory-updated`, after commit).
    PresenceTeamRealtimeEventsAdapter,
    {
      provide: TEAM_REALTIME_EVENTS_PORT,
      useExisting: PresenceTeamRealtimeEventsAdapter,
    },
  ],
})
export class GameSessionModule {}

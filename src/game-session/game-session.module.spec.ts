import { Test, TestingModule } from '@nestjs/testing';
import { ShopQueryService } from '../commerce/application/queries';
import {
  PURCHASE_REPOSITORY_PORT,
  SHOP_ITEM_REPOSITORY_PORT,
} from '../commerce/domain/ports';
import {
  DrizzlePurchaseRepository,
  DrizzleShopItemRepository,
} from '../commerce/infrastructure/persistence';
import { AppConfigService } from '../config/app-config.service';
import { CLOCK_PORT } from '../core/ports/clock.port';
import { ID_GENERATOR_PORT } from '../core/ports/id-generator.port';
import { RANDOM_GENERATOR_PORT } from '../core/ports/randomness.port';
import { REALTIME_EVENTS_PORT } from '../core/ports/realtime-events.port';
import { TOKEN_GENERATOR_PORT } from '../core/ports/token-generator.port';
import { BoardQueryService } from '../gameplay/application/queries';
import {
  BOARD_CELL_REPOSITORY_PORT,
  CATEGORY_REPOSITORY_PORT,
  QUESTION_REPOSITORY_PORT,
} from '../gameplay/domain/ports';
import {
  DrizzleBoardCellRepository,
  DrizzleCategoryRepository,
  DrizzleQuestionRepository,
} from '../gameplay/infrastructure/persistence';
import { DatabaseService } from '../infrastructure/database/database.service';
import { TransactionContext } from '../infrastructure/database/transaction-context';
import {
  BOARD_INITIALIZATION_PORT,
  HOST_REALTIME_EVENTS_PORT,
  TRANSACTION_PORT,
} from './application/ports';
import {
  LobbyQueryService,
  RoomSnapshotAssembler,
  TimerQueryService,
} from './application/queries';
import { AnswerTimerRegistry, ShopTimerRegistry } from './application/timers';
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
  makeBoardInit,
  makeClock,
  makeConfig,
  makeIdGenerator,
  makeRandom,
  makeRealtime,
  makeTokenGenerator,
} from './application/use-cases/lobby-test-doubles';
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
  ShopController,
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
 * Verifies the DI wiring of GameSessionModule without the real
 * InfrastructureModule/RealtimeModule/GameplayModule/CommerceModule (no
 * PostgreSQL pool, no socket server). The bindings mirror the module; boundary
 * dependencies are stubbed. Sub-stage 6.2a adds the battle use cases, the
 * answer timer, the timer query, and the Board/Questions controllers — the
 * gameplay repository ports and BoardQueryService (normally imported from
 * GameplayModule) are bound here to their Drizzle adapters / class so the
 * graph resolves. Sub-stage 8.2 adds the shop timer, CloseShop, the
 * ShopController and the commerce-side bindings (the two repository ports
 * ShopQueryService needs, normally imported from CommerceModule).
 */
describe('GameSessionModule wiring', () => {
  const databaseStub = {
    db: {},
    transaction: jest.fn(),
  } as unknown as DatabaseService;

  const buildModule = (): Promise<TestingModule> =>
    Test.createTestingModule({
      controllers: [
        RoomsController,
        PlayersController,
        TeamsController,
        TopicsController,
        GameController,
        BoardController,
        QuestionsController,
        ShopController,
      ],
      providers: [
        { provide: DatabaseService, useValue: databaseStub },
        TransactionContext,
        { provide: CLOCK_PORT, useValue: makeClock() },
        { provide: ID_GENERATOR_PORT, useValue: makeIdGenerator() },
        { provide: TOKEN_GENERATOR_PORT, useValue: makeTokenGenerator() },
        { provide: RANDOM_GENERATOR_PORT, useValue: makeRandom() },
        { provide: REALTIME_EVENTS_PORT, useValue: makeRealtime() },
        { provide: AppConfigService, useValue: makeConfig() },
        { provide: ROOM_REPOSITORY_PORT, useClass: DrizzleRoomRepository },
        { provide: PLAYER_REPOSITORY_PORT, useClass: DrizzlePlayerRepository },
        { provide: TEAM_REPOSITORY_PORT, useClass: DrizzleTeamRepository },
        { provide: TOPIC_REPOSITORY_PORT, useClass: DrizzleTopicRepository },
        { provide: TRANSACTION_PORT, useClass: DrizzleTransactionAdapter },
        { provide: BOARD_INITIALIZATION_PORT, useValue: makeBoardInit() },
        // Gameplay ports + read model (normally from the imported GameplayModule).
        {
          provide: CATEGORY_REPOSITORY_PORT,
          useClass: DrizzleCategoryRepository,
        },
        {
          provide: QUESTION_REPOSITORY_PORT,
          useClass: DrizzleQuestionRepository,
        },
        {
          provide: BOARD_CELL_REPOSITORY_PORT,
          useClass: DrizzleBoardCellRepository,
        },
        BoardQueryService,
        // Commerce ports + read model (normally from the imported CommerceModule).
        {
          provide: SHOP_ITEM_REPOSITORY_PORT,
          useClass: DrizzleShopItemRepository,
        },
        {
          provide: PURCHASE_REPOSITORY_PORT,
          useClass: DrizzlePurchaseRepository,
        },
        ShopQueryService,
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
        // Battle-cycle providers (6.2a).
        AnswerTimerRegistry,
        SelectQuestionUseCase,
        OpenQuestionUseCase,
        RejectSelectionUseCase,
        SubmitAnswerUseCase,
        ReviewAnswerUseCase,
        AdvanceOnTimeoutUseCase,
        // Shop flow providers (8.2), mirroring the module.
        ShopTimerRegistry,
        CloseShopUseCase,
        RoomSnapshotAssembler,
        LobbyQueryService,
        TimerQueryService,
        HostAuthGuard,
        PlayerIdentityGuard,
        GameSessionGateway,
        LobbyPresenceRegistry,
        SocketIdentityResolver,
        // Host-socket delivery (6.2b), mirroring the module binding.
        PresenceHostRealtimeEventsAdapter,
        {
          provide: HOST_REALTIME_EVENTS_PORT,
          useExisting: PresenceHostRealtimeEventsAdapter,
        },
      ],
    }).compile();

  it('resolves the four repository ports to their Drizzle adapters', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(ROOM_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleRoomRepository,
    );
    expect(moduleRef.get(PLAYER_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzlePlayerRepository,
    );
    expect(moduleRef.get(TEAM_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleTeamRepository,
    );
    expect(moduleRef.get(TOPIC_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleTopicRepository,
    );
    await moduleRef.close();
  });

  it('resolves the transaction port to the Drizzle adapter', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(TRANSACTION_PORT)).toBeInstanceOf(
      DrizzleTransactionAdapter,
    );
    await moduleRef.close();
  });

  it('instantiates the lobby use cases, queries and guards', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(CreateRoomUseCase)).toBeInstanceOf(CreateRoomUseCase);
    expect(moduleRef.get(StartGameUseCase)).toBeInstanceOf(StartGameUseCase);
    expect(moduleRef.get(LobbyQueryService)).toBeInstanceOf(LobbyQueryService);
    expect(moduleRef.get(HostAuthGuard)).toBeInstanceOf(HostAuthGuard);
    expect(moduleRef.get(PlayerIdentityGuard)).toBeInstanceOf(
      PlayerIdentityGuard,
    );
    await moduleRef.close();
  });

  it('instantiates the WebSocket presence/reconnect providers (5.2b)', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(GameSessionGateway)).toBeInstanceOf(
      GameSessionGateway,
    );
    expect(moduleRef.get(LobbyPresenceRegistry)).toBeInstanceOf(
      LobbyPresenceRegistry,
    );
    expect(moduleRef.get(SocketIdentityResolver)).toBeInstanceOf(
      SocketIdentityResolver,
    );
    expect(moduleRef.get(MarkClientDisconnectedUseCase)).toBeInstanceOf(
      MarkClientDisconnectedUseCase,
    );
    await moduleRef.close();
  });

  it('resolves the host-events port to the presence adapter (6.2b)', async () => {
    const moduleRef = await buildModule();
    const adapter = moduleRef.get(PresenceHostRealtimeEventsAdapter);
    expect(adapter).toBeInstanceOf(PresenceHostRealtimeEventsAdapter);
    // useExisting: the port token resolves to the SAME instance as the class.
    expect(moduleRef.get(HOST_REALTIME_EVENTS_PORT)).toBe(adapter);
    await moduleRef.close();
  });

  it('instantiates the battle-cycle use cases, timer and query (6.2a)', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(SelectQuestionUseCase)).toBeInstanceOf(
      SelectQuestionUseCase,
    );
    expect(moduleRef.get(OpenQuestionUseCase)).toBeInstanceOf(
      OpenQuestionUseCase,
    );
    expect(moduleRef.get(RejectSelectionUseCase)).toBeInstanceOf(
      RejectSelectionUseCase,
    );
    expect(moduleRef.get(SubmitAnswerUseCase)).toBeInstanceOf(
      SubmitAnswerUseCase,
    );
    expect(moduleRef.get(ReviewAnswerUseCase)).toBeInstanceOf(
      ReviewAnswerUseCase,
    );
    expect(moduleRef.get(AdvanceOnTimeoutUseCase)).toBeInstanceOf(
      AdvanceOnTimeoutUseCase,
    );
    expect(moduleRef.get(AnswerTimerRegistry)).toBeInstanceOf(
      AnswerTimerRegistry,
    );
    expect(moduleRef.get(TimerQueryService)).toBeInstanceOf(TimerQueryService);
    await moduleRef.close();
  });

  it('instantiates the shop flow: timer, close use case and read model (8.2)', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(ShopTimerRegistry)).toBeInstanceOf(ShopTimerRegistry);
    expect(moduleRef.get(CloseShopUseCase)).toBeInstanceOf(CloseShopUseCase);
    expect(moduleRef.get(ShopQueryService)).toBeInstanceOf(ShopQueryService);
    await moduleRef.close();
  });

  it('instantiates all lobby and battle controllers', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(RoomsController)).toBeInstanceOf(RoomsController);
    expect(moduleRef.get(PlayersController)).toBeInstanceOf(PlayersController);
    expect(moduleRef.get(TeamsController)).toBeInstanceOf(TeamsController);
    expect(moduleRef.get(TopicsController)).toBeInstanceOf(TopicsController);
    expect(moduleRef.get(GameController)).toBeInstanceOf(GameController);
    expect(moduleRef.get(BoardController)).toBeInstanceOf(BoardController);
    expect(moduleRef.get(QuestionsController)).toBeInstanceOf(
      QuestionsController,
    );
    expect(moduleRef.get(ShopController)).toBeInstanceOf(ShopController);
    await moduleRef.close();
  });
});

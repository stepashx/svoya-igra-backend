import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '../config/app-config.service';
import { CLOCK_PORT } from '../core/ports/clock.port';
import { ID_GENERATOR_PORT } from '../core/ports/id-generator.port';
import { RANDOM_GENERATOR_PORT } from '../core/ports/randomness.port';
import { REALTIME_EVENTS_PORT } from '../core/ports/realtime-events.port';
import { TOKEN_GENERATOR_PORT } from '../core/ports/token-generator.port';
import { DatabaseService } from '../infrastructure/database/database.service';
import { TransactionContext } from '../infrastructure/database/transaction-context';
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
  MarkTeamReadyUseCase,
  ReconnectClientUseCase,
  SelectTopicUseCase,
  StartGameUseCase,
  UpdateProfileUseCase,
} from './application/use-cases';
import {
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
  GameController,
  PlayersController,
  RoomsController,
  TeamsController,
  TopicsController,
} from './presentation/controllers';
import { HostAuthGuard, PlayerIdentityGuard } from './presentation/http';

/**
 * Verifies the DI wiring of GameSessionModule without the real
 * InfrastructureModule/RealtimeModule (no PostgreSQL pool, no socket server).
 * The bindings mirror the module; boundary dependencies are stubbed.
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
        RoomSnapshotAssembler,
        LobbyQueryService,
        HostAuthGuard,
        PlayerIdentityGuard,
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

  it('instantiates the five lobby controllers', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(RoomsController)).toBeInstanceOf(RoomsController);
    expect(moduleRef.get(PlayersController)).toBeInstanceOf(PlayersController);
    expect(moduleRef.get(TeamsController)).toBeInstanceOf(TeamsController);
    expect(moduleRef.get(TopicsController)).toBeInstanceOf(TopicsController);
    expect(moduleRef.get(GameController)).toBeInstanceOf(GameController);
    await moduleRef.close();
  });
});

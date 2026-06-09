import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../infrastructure/database/database.service';
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
 * Verifies the DI wiring of GameSessionModule without the real
 * InfrastructureModule (no PostgreSQL pool). The bindings mirror the module; a
 * stub DatabaseService stands in for the database seam the adapters inject.
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
        { provide: ROOM_REPOSITORY_PORT, useClass: DrizzleRoomRepository },
        { provide: PLAYER_REPOSITORY_PORT, useClass: DrizzlePlayerRepository },
        { provide: TEAM_REPOSITORY_PORT, useClass: DrizzleTeamRepository },
        { provide: TOPIC_REPOSITORY_PORT, useClass: DrizzleTopicRepository },
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

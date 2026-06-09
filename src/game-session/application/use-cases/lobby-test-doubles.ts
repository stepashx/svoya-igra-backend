import { ClockPort } from '../../../core/ports/clock.port';
import { IdGeneratorPort } from '../../../core/ports/id-generator.port';
import { RandomGeneratorPort } from '../../../core/ports/randomness.port';
import { RealtimeEventsPort } from '../../../core/ports/realtime-events.port';
import { TokenGeneratorPort } from '../../../core/ports/token-generator.port';
import { AppConfigService } from '../../../config/app-config.service';
import {
  Player,
  PlayerReconstituteProps,
  Room,
  RoomReconstituteProps,
  Team,
  TeamReconstituteProps,
  Topic,
} from '../../domain/entities';
import {
  PlayerRepositoryPort,
  RoomRepositoryPort,
  TeamRepositoryPort,
  TopicRepositoryPort,
} from '../../domain/ports';
import {
  PlayerName,
  ReconnectToken,
  RoomCode,
  Score,
  TeamName,
} from '../../domain/value-objects';
import { TransactionPort } from '../ports';

/**
 * Shared in-memory test doubles for the lobby use-case specs. Excluded from the
 * production build (see tsconfig.build.json). Entity builders default to a valid
 * ACTIVE room in the LOBBY stage; pass overrides to reach other states.
 */

export const FIXED_NOW = new Date('2026-06-09T12:00:00.000Z');

export const makeRoomRepo = (): jest.Mocked<RoomRepositoryPort> => ({
  create: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn().mockResolvedValue(null),
  findByCode: jest.fn().mockResolvedValue(null),
  findByHostReconnectToken: jest.fn().mockResolvedValue(null),
  acquireRoomLock: jest.fn().mockResolvedValue(undefined),
});

export const makePlayerRepo = (): jest.Mocked<PlayerRepositoryPort> => ({
  create: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn().mockResolvedValue(null),
  findByReconnectToken: jest.fn().mockResolvedValue(null),
  findByRoomId: jest.fn().mockResolvedValue([]),
  findByRoomIdAndName: jest.fn().mockResolvedValue(null),
  findByTeamId: jest.fn().mockResolvedValue([]),
  countByTeamId: jest.fn().mockResolvedValue(0),
});

export const makeTeamRepo = (): jest.Mocked<TeamRepositoryPort> => ({
  create: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  findById: jest.fn().mockResolvedValue(null),
  findByRoomId: jest.fn().mockResolvedValue([]),
  countByRoomId: jest.fn().mockResolvedValue(0),
  findByRoomAndSelectedTopic: jest.fn().mockResolvedValue(null),
});

export const makeTopicRepo = (): jest.Mocked<TopicRepositoryPort> => ({
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
});

/** Runs work immediately — no real transaction. */
export const makeTransactionPort = (): TransactionPort => ({
  run: (work) => work(),
});

export const makeRealtime = (): jest.Mocked<RealtimeEventsPort> => ({
  emitToRoom: jest.fn(),
  emitToClient: jest.fn(),
});

export const makeClock = (now: Date = FIXED_NOW): ClockPort => ({
  now: () => now,
  nowMs: () => now.getTime(),
});

export const makeIdGenerator = (prefix = 'id'): IdGeneratorPort => {
  let counter = 0;
  return {
    generate: () => {
      counter += 1;
      return `${prefix}-${counter}`;
    },
  };
};

export const makeTokenGenerator = (code = 'ABCDEF'): TokenGeneratorPort => {
  let counter = 0;
  return {
    generateToken: () => {
      counter += 1;
      return `token-${counter}`;
    },
    generateRoomCode: () => code,
  };
};

/** Deterministic randomness: pick → first element, shuffle → identity order. */
export const makeRandom = (): RandomGeneratorPort => ({
  pick: (items) => items[0],
  shuffle: (items) => [...items],
});

export const makeConfig = (
  gameLimits: Partial<{
    maxTeams: number;
    minTeamsToStart: number;
    maxPlayersPerTeam: number;
  }> = {},
): AppConfigService =>
  ({
    gameLimits: {
      maxTeams: 3,
      minTeamsToStart: 2,
      maxPlayersPerTeam: 5,
      ...gameLimits,
    },
    reconnect: { roomCodeLength: 6, tokenTtlSeconds: 86_400 },
  }) as unknown as AppConfigService;

export const makeRoom = (
  overrides: Partial<RoomReconstituteProps> = {},
): Room =>
  Room.reconstitute({
    id: 'room-1',
    code: RoomCode.create('ABCDEF'),
    status: 'ACTIVE',
    currentStage: 'LOBBY',
    hostId: 'host-1',
    hostReconnectToken: ReconnectToken.create('host-token'),
    currentTeamId: null,
    totalQuestionsCount: 30,
    blockedQuestionsCount: 0,
    currentShopRound: 0,
    createdAt: FIXED_NOW,
    finishedAt: null,
    ...overrides,
  });

export const makePlayer = (
  overrides: Partial<PlayerReconstituteProps> = {},
): Player =>
  Player.reconstitute({
    id: 'player-1',
    roomId: 'room-1',
    teamId: null,
    name: PlayerName.create('Ann'),
    avatar: null,
    reconnectToken: ReconnectToken.create('player-token'),
    connectionStatus: 'CONNECTED',
    isCaptain: false,
    joinedAt: FIXED_NOW,
    lastSeenAt: FIXED_NOW,
    ...overrides,
  });

export const makeTeam = (
  overrides: Partial<TeamReconstituteProps> = {},
): Team =>
  Team.reconstitute({
    id: 'team-1',
    roomId: 'room-1',
    name: TeamName.create('Reds'),
    captainPlayerId: null,
    selectedTopicId: null,
    isReady: false,
    turnOrder: null,
    earnedScore: Score.create(0),
    balance: Score.create(0),
    presentationSubmissionId: null,
    createdAt: FIXED_NOW,
    ...overrides,
  });

export const makeTopic = (id: string, title = id): Topic =>
  Topic.reconstitute({ id, title, description: null });

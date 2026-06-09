import {
  NoFreeTopicsError,
  NotEnoughReadyTeamsError,
  RoomNotActiveError,
} from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { RoomSnapshotAssembler } from '../queries/room-snapshot.assembler';
import { StartGameUseCase } from './start-game.use-case';
import {
  makeConfig,
  makePlayerRepo,
  makeRandom,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTopic,
  makeTopicRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

const emittedEvents = (realtime: ReturnType<typeof makeRealtime>): string[] =>
  realtime.emitToRoom.mock.calls.map((call) => call[1]);

describe('StartGameUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const topics = makeTopicRepo();
    const players = makePlayerRepo();
    const realtime = makeRealtime();
    const room = makeRoom({ currentStage: 'READY_CHECK' });
    rooms.findById.mockResolvedValue(room);
    topics.findAll.mockResolvedValue([
      makeTopic('topic-1'),
      makeTopic('topic-2'),
      makeTopic('topic-3'),
    ]);
    const uc = new StartGameUseCase(
      rooms,
      teams,
      topics,
      makeRandom(),
      realtime,
      makeTransactionPort(),
      new RoomSnapshotAssembler(players, teams),
      makeConfig(),
    );
    return { uc, rooms, teams, topics, realtime, room };
  };

  it('rejects when fewer than the minimum teams are ready', async () => {
    const { uc, teams } = build();
    teams.findByRoomId.mockResolvedValue([
      makeTeam({ id: 'team-1', isReady: true }),
    ]);
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      NotEnoughReadyTeamsError,
    );
  });

  it('starts: random first team + turn order, stage → GAME_BOARD, emits the §16.3 events', async () => {
    const { uc, rooms, teams, realtime, room } = build();
    const team1 = makeTeam({
      id: 'team-1',
      isReady: true,
      selectedTopicId: 'topic-1',
    });
    const team2 = makeTeam({
      id: 'team-2',
      isReady: true,
      selectedTopicId: 'topic-2',
    });
    teams.findByRoomId.mockResolvedValue([team1, team2]);

    const snapshot = await uc.execute({ roomId: 'room-1' });

    expect(rooms.acquireRoomLock).toHaveBeenCalledWith('room-1');
    expect(room.currentStage).toBe('GAME_BOARD');
    // Deterministic identity shuffle → first participant is the active team.
    expect(room.currentTeamId).toBe('team-1');
    expect(team1.turnOrder).toBe(0);
    expect(team2.turnOrder).toBe(1);
    expect(teams.update).toHaveBeenCalledTimes(2);
    expect(rooms.update).toHaveBeenCalledWith(room);
    expect(snapshot.room).toBe(room);
    expect(emittedEvents(realtime)).toEqual([
      GameSessionEvent.GameStarted,
      GameSessionEvent.GameFirstTeamSelected,
      GameSessionEvent.GameStageChanged,
      GameSessionEvent.GameTurnChanged,
      GameSessionEvent.GameStateUpdated,
    ]);
  });

  it('auto-assigns a free topic to a ready team that has none', async () => {
    const { uc, teams } = build();
    const team1 = makeTeam({
      id: 'team-1',
      isReady: true,
      selectedTopicId: 'topic-1',
    });
    const team2 = makeTeam({
      id: 'team-2',
      isReady: true,
      selectedTopicId: null,
    });
    teams.findByRoomId.mockResolvedValue([team1, team2]);

    await uc.execute({ roomId: 'room-1' });

    // Free topics are [topic-2, topic-3]; identity shuffle picks topic-2.
    expect(team2.selectedTopicId).toBe('topic-2');
  });

  it('rejects when no free topics remain to auto-assign', async () => {
    const { uc, teams, topics } = build();
    topics.findAll.mockResolvedValue([makeTopic('topic-1')]);
    teams.findByRoomId.mockResolvedValue([
      makeTeam({ id: 'team-1', isReady: true, selectedTopicId: 'topic-1' }),
      makeTeam({ id: 'team-2', isReady: true, selectedTopicId: null }),
    ]);
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      NoFreeTopicsError,
    );
  });

  it('rejects starting a closed room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(makeRoom({ status: 'CLOSED' }));
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
  });
});

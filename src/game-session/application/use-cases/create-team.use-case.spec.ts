import {
  AlreadyOnTeamError,
  RoomNotActiveError,
  TeamLimitReachedError,
} from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { CreateTeamUseCase } from './create-team.use-case';
import {
  makeClock,
  makeConfig,
  makeIdGenerator,
  makePlayer,
  makePlayerRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeamRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

const emittedEvents = (realtime: ReturnType<typeof makeRealtime>): string[] =>
  realtime.emitToRoom.mock.calls.map((call) => call[1]);

describe('CreateTeamUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const players = makePlayerRepo();
    const realtime = makeRealtime();
    const room = makeRoom({ currentStage: 'LOBBY' });
    const player = makePlayer({ teamId: null });
    rooms.findById.mockResolvedValue(room);
    players.findById.mockResolvedValue(player);
    teams.countByRoomId.mockResolvedValue(0);
    const uc = new CreateTeamUseCase(
      rooms,
      teams,
      players,
      makeIdGenerator('team'),
      makeClock(),
      realtime,
      makeTransactionPort(),
      makeConfig(),
    );
    return { uc, rooms, teams, players, realtime, room, player };
  };

  const input = { roomId: 'room-1', actingPlayerId: 'player-1', name: 'Reds' };

  it('creates the first team: creator becomes captain, stage → TEAM_SETUP', async () => {
    const { uc, rooms, teams, realtime, room, player } = build();

    const team = await uc.execute(input);

    expect(rooms.acquireRoomLock).toHaveBeenCalledWith('room-1');
    expect(team.captainPlayerId).toBe('player-1');
    expect(player.isCaptain).toBe(true);
    expect(player.teamId).toBe(team.id);
    expect(teams.create).toHaveBeenCalledWith(team);
    expect(room.currentStage).toBe('TEAM_SETUP');
    expect(rooms.update).toHaveBeenCalledWith(room);
    expect(emittedEvents(realtime)).toEqual([
      GameSessionEvent.TeamCreated,
      GameSessionEvent.GameStageChanged,
    ]);
  });

  it('does not change the stage for a second team', async () => {
    const { uc, rooms, teams, realtime, room } = build();
    room.transitionTo('TEAM_SETUP');
    teams.countByRoomId.mockResolvedValue(1);

    await uc.execute(input);

    expect(rooms.update).not.toHaveBeenCalled();
    expect(emittedEvents(realtime)).toEqual([GameSessionEvent.TeamCreated]);
  });

  it('rejects when the team limit is reached', async () => {
    const { uc, teams } = build();
    teams.countByRoomId.mockResolvedValue(3);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      TeamLimitReachedError,
    );
  });

  it('rejects a player who is already on a team', async () => {
    const { uc, players } = build();
    players.findById.mockResolvedValue(makePlayer({ teamId: 'team-x' }));
    await expect(uc.execute(input)).rejects.toBeInstanceOf(AlreadyOnTeamError);
  });

  it('rejects creating a team in a closed room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(makeRoom({ status: 'CLOSED' }));
    await expect(uc.execute(input)).rejects.toBeInstanceOf(RoomNotActiveError);
  });
});

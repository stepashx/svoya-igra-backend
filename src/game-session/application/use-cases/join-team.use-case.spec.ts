import {
  AlreadyOnTeamError,
  RoomNotActiveError,
  TeamFullError,
  TeamNotFoundError,
} from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { JoinTeamUseCase } from './join-team.use-case';
import {
  makeConfig,
  makePlayer,
  makePlayerRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

const emittedEvents = (realtime: ReturnType<typeof makeRealtime>): string[] =>
  realtime.emitToRoom.mock.calls.map((call) => call[1]);

describe('JoinTeamUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const players = makePlayerRepo();
    const realtime = makeRealtime();
    rooms.findById.mockResolvedValue(makeRoom());
    teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', captainPlayerId: 'captain-1' }),
    );
    players.findById.mockResolvedValue(
      makePlayer({ id: 'player-2', teamId: null }),
    );
    players.countByTeamId.mockResolvedValue(1);
    const uc = new JoinTeamUseCase(
      rooms,
      teams,
      players,
      realtime,
      makeTransactionPort(),
      makeConfig(),
    );
    return { uc, rooms, teams, players, realtime };
  };

  const input = {
    roomId: 'room-1',
    teamId: 'team-1',
    actingPlayerId: 'player-2',
  };

  it('joins the team and broadcasts team-joined + team-updated', async () => {
    const { uc, rooms, players, realtime } = build();

    const player = await uc.execute(input);

    expect(rooms.acquireRoomLock).toHaveBeenCalledWith('room-1');
    expect(player.teamId).toBe('team-1');
    expect(players.update).toHaveBeenCalledWith(player);
    expect(emittedEvents(realtime)).toEqual([
      GameSessionEvent.TeamJoined,
      GameSessionEvent.TeamUpdated,
    ]);
  });

  it('rejects when the team is full', async () => {
    const { uc, players } = build();
    players.countByTeamId.mockResolvedValue(5);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(TeamFullError);
  });

  it('rejects a player already on a team', async () => {
    const { uc, players } = build();
    players.findById.mockResolvedValue(
      makePlayer({ id: 'player-2', teamId: 'team-9' }),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(AlreadyOnTeamError);
  });

  it('rejects an unknown team', async () => {
    const { uc, teams } = build();
    teams.findById.mockResolvedValue(null);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('rejects a team that belongs to another room', async () => {
    const { uc, teams } = build();
    teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', roomId: 'other-room' }),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('rejects joining in a closed room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(makeRoom({ status: 'CLOSED' }));
    await expect(uc.execute(input)).rejects.toBeInstanceOf(RoomNotActiveError);
  });
});

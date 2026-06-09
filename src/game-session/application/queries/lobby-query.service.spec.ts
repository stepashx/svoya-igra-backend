import {
  InvalidRoomCodeError,
  RoomNotFoundError,
  TeamNotFoundError,
} from '../../domain/errors';
import {
  makePlayer,
  makePlayerRepo,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTopic,
  makeTopicRepo,
} from '../use-cases/lobby-test-doubles';
import { LobbyQueryService } from './lobby-query.service';
import { RoomSnapshotAssembler } from './room-snapshot.assembler';

describe('LobbyQueryService', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const players = makePlayerRepo();
    const teams = makeTeamRepo();
    const topics = makeTopicRepo();
    const svc = new LobbyQueryService(
      rooms,
      players,
      teams,
      topics,
      new RoomSnapshotAssembler(players, teams),
    );
    return { svc, rooms, players, teams, topics };
  };

  it('resolves a room by code', async () => {
    const { svc, rooms } = build();
    rooms.findByCode.mockResolvedValue(makeRoom());
    await expect(svc.getRoom('ABCDEF')).resolves.toMatchObject({
      id: 'room-1',
    });
  });

  it('rejects an invalid room code before any lookup', async () => {
    const { svc, rooms } = build();
    await expect(svc.getRoom('@@')).rejects.toBeInstanceOf(
      InvalidRoomCodeError,
    );
    expect(rooms.findByCode).not.toHaveBeenCalled();
  });

  it('rejects an unknown room', async () => {
    const { svc, rooms } = build();
    rooms.findByCode.mockResolvedValue(null);
    await expect(svc.getRoom('ABCDEF')).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });

  it('annotates catalog topics with their in-room availability', async () => {
    const { svc, rooms, topics, teams } = build();
    rooms.findByCode.mockResolvedValue(makeRoom());
    topics.findAll.mockResolvedValue([
      makeTopic('topic-1'),
      makeTopic('topic-2'),
    ]);
    teams.findByRoomId.mockResolvedValue([
      makeTeam({ id: 'team-1', selectedTopicId: 'topic-1' }),
    ]);

    const availability = await svc.getRoomTopics('ABCDEF');

    expect(availability).toEqual([
      {
        topic: expect.objectContaining({ id: 'topic-1' }),
        takenByTeamId: 'team-1',
      },
      {
        topic: expect.objectContaining({ id: 'topic-2' }),
        takenByTeamId: null,
      },
    ]);
  });

  it('returns a team with its members', async () => {
    const { svc, rooms, teams, players } = build();
    rooms.findByCode.mockResolvedValue(makeRoom());
    teams.findById.mockResolvedValue(makeTeam({ id: 'team-1' }));
    players.findByTeamId.mockResolvedValue([
      makePlayer({ id: 'captain-1', isCaptain: true }),
      makePlayer({ id: 'player-2' }),
    ]);

    const { team, members } = await svc.getTeamWithMembers('ABCDEF', 'team-1');

    expect(team.id).toBe('team-1');
    expect(members).toHaveLength(2);
  });

  it('rejects a team that is not in the room', async () => {
    const { svc, rooms, teams } = build();
    rooms.findByCode.mockResolvedValue(makeRoom());
    teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', roomId: 'other' }),
    );
    await expect(
      svc.getTeamWithMembers('ABCDEF', 'team-1'),
    ).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('returns the captain of a team', async () => {
    const { svc, rooms, teams, players } = build();
    rooms.findByCode.mockResolvedValue(makeRoom());
    teams.findById.mockResolvedValue(makeTeam({ id: 'team-1' }));
    players.findByTeamId.mockResolvedValue([
      makePlayer({ id: 'player-2' }),
      makePlayer({ id: 'captain-1', isCaptain: true }),
    ]);

    const captain = await svc.getTeamCaptain('ABCDEF', 'team-1');

    expect(captain?.id).toBe('captain-1');
  });

  it('returns null for the active team before the game starts', async () => {
    const { svc, rooms } = build();
    rooms.findByCode.mockResolvedValue(makeRoom({ currentTeamId: null }));
    await expect(svc.getActiveTeam('ABCDEF')).resolves.toBeNull();
  });
});

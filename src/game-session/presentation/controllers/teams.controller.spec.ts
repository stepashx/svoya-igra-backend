import { LobbyQueryService } from '../../application/queries';
import {
  CreateTeamUseCase,
  JoinTeamUseCase,
  LeaveTeamUseCase,
  MarkTeamReadyUseCase,
  SelectTopicUseCase,
} from '../../application/use-cases';
import {
  makePlayer,
  makeTeam,
} from '../../application/use-cases/lobby-test-doubles';
import { TeamsController } from './teams.controller';

describe('TeamsController', () => {
  const build = () => {
    const createTeam = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateTeamUseCase>;
    const joinTeam = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<JoinTeamUseCase>;
    const leaveTeam = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<LeaveTeamUseCase>;
    const selectTopic = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SelectTopicUseCase>;
    const markReady = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<MarkTeamReadyUseCase>;
    const lobby = {
      listTeams: jest.fn(),
      getTeamWithMembers: jest.fn(),
      getTeamCaptain: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const controller = new TeamsController(
      createTeam,
      joinTeam,
      leaveTeam,
      selectTopic,
      markReady,
      lobby,
    );
    return {
      controller,
      createTeam,
      joinTeam,
      leaveTeam,
      selectTopic,
      markReady,
      lobby,
    };
  };

  const captain = makePlayer({
    id: 'captain-1',
    teamId: 'team-1',
    isCaptain: true,
  });

  it('creates a team for the current player', async () => {
    const { controller, createTeam } = build();
    createTeam.execute.mockResolvedValue(makeTeam({ id: 'team-1' }));

    const res = await controller.create(makePlayer({ id: 'p1' }), {
      name: 'Reds',
    });

    expect(createTeam.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      actingPlayerId: 'p1',
      name: 'Reds',
    });
    expect(res.id).toBe('team-1');
  });

  it('lists teams', async () => {
    const { controller, lobby } = build();
    lobby.listTeams.mockResolvedValue([makeTeam()]);
    expect(await controller.list('ABCDEF')).toHaveLength(1);
  });

  it('gets a team with its members', async () => {
    const { controller, lobby } = build();
    lobby.getTeamWithMembers.mockResolvedValue({
      team: makeTeam({ id: 'team-1' }),
      members: [captain],
    });
    const res = await controller.getById('ABCDEF', 'team-1');
    expect(res.team.id).toBe('team-1');
    expect(res.members).toHaveLength(1);
  });

  it('joins a team', async () => {
    const { controller, joinTeam } = build();
    joinTeam.execute.mockResolvedValue(
      makePlayer({ id: 'p2', teamId: 'team-1' }),
    );
    const res = await controller.addMember(makePlayer({ id: 'p2' }), 'team-1');
    expect(joinTeam.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      teamId: 'team-1',
      actingPlayerId: 'p2',
    });
    expect(res.teamId).toBe('team-1');
  });

  it('leaves a team', async () => {
    const { controller, leaveTeam } = build();
    leaveTeam.execute.mockResolvedValue(makePlayer({ id: 'p2', teamId: null }));
    const res = await controller.removeMember(
      makePlayer({ id: 'p2' }),
      'team-1',
    );
    expect(leaveTeam.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      teamId: 'team-1',
      actingPlayerId: 'p2',
    });
    expect(res.teamId).toBeNull();
  });

  it('selects a topic', async () => {
    const { controller, selectTopic } = build();
    selectTopic.execute.mockResolvedValue(
      makeTeam({ id: 'team-1', selectedTopicId: 'topic-1' }),
    );
    const res = await controller.selectTeamTopic(captain, 'team-1', {
      topicId: 'topic-1',
    });
    expect(selectTopic.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      teamId: 'team-1',
      actingPlayerId: 'captain-1',
      topicId: 'topic-1',
    });
    expect(res.selectedTopicId).toBe('topic-1');
  });

  it('sets readiness', async () => {
    const { controller, markReady } = build();
    markReady.execute.mockResolvedValue(
      makeTeam({ id: 'team-1', isReady: true }),
    );
    const res = await controller.setReady(captain, 'team-1', { isReady: true });
    expect(markReady.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      teamId: 'team-1',
      actingPlayerId: 'captain-1',
      isReady: true,
    });
    expect(res.isReady).toBe(true);
  });

  it('returns the captain (or null)', async () => {
    const { controller, lobby } = build();
    lobby.getTeamCaptain.mockResolvedValue(captain);
    expect((await controller.getCaptain('ABCDEF', 'team-1'))?.id).toBe(
      'captain-1',
    );

    lobby.getTeamCaptain.mockResolvedValue(null);
    expect(await controller.getCaptain('ABCDEF', 'team-1')).toBeNull();
  });
});

import {
  NotTeamCaptainError,
  RoomNotActiveError,
  TeamNotFoundError,
  TopicAlreadyTakenError,
  TopicNotFoundError,
} from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { SelectTopicUseCase } from './select-topic.use-case';
import {
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTopic,
  makeTopicRepo,
} from './lobby-test-doubles';

describe('SelectTopicUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const topics = makeTopicRepo();
    const realtime = makeRealtime();
    rooms.findById.mockResolvedValue(makeRoom());
    teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', captainPlayerId: 'captain-1' }),
    );
    topics.findById.mockResolvedValue(makeTopic('topic-1'));
    const uc = new SelectTopicUseCase(rooms, teams, topics, realtime);
    return { uc, rooms, teams, topics, realtime };
  };

  const input = {
    roomId: 'room-1',
    teamId: 'team-1',
    actingPlayerId: 'captain-1',
    topicId: 'topic-1',
  };

  it('selects the topic and broadcasts team-topic-selected', async () => {
    const { uc, teams, realtime } = build();

    const team = await uc.execute(input);

    expect(team.selectedTopicId).toBe('topic-1');
    expect(teams.update).toHaveBeenCalledWith(team);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameSessionEvent.TeamTopicSelected,
      expect.objectContaining({ roomId: 'room-1' }),
    );
  });

  it('forbids a non-captain from selecting', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ ...input, actingPlayerId: 'someone-else' }),
    ).rejects.toBeInstanceOf(NotTeamCaptainError);
  });

  it('rejects an unknown topic', async () => {
    const { uc, topics } = build();
    topics.findById.mockResolvedValue(null);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(TopicNotFoundError);
  });

  it('propagates a topic-already-taken violation from the repository', async () => {
    const { uc, teams } = build();
    teams.update.mockRejectedValue(new TopicAlreadyTakenError());
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      TopicAlreadyTakenError,
    );
  });

  it('rejects an unknown team', async () => {
    const { uc, teams } = build();
    teams.findById.mockResolvedValue(null);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(TeamNotFoundError);
  });

  it('rejects selecting in a closed room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(makeRoom({ status: 'CLOSED' }));
    await expect(uc.execute(input)).rejects.toBeInstanceOf(RoomNotActiveError);
  });
});

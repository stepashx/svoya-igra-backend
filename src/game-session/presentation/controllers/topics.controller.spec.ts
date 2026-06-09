import { LobbyQueryService } from '../../application/queries';
import { makeTopic } from '../../application/use-cases/lobby-test-doubles';
import { TopicsController } from './topics.controller';

describe('TopicsController', () => {
  const build = () => {
    const lobby = {
      listTopics: jest.fn(),
      getRoomTopics: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const controller = new TopicsController(lobby);
    return { controller, lobby };
  };

  it('lists the global topic catalog', async () => {
    const { controller, lobby } = build();
    lobby.listTopics.mockResolvedValue([
      makeTopic('topic-1', 'History'),
      makeTopic('topic-2', 'Science'),
    ]);
    const res = await controller.getAll();
    expect(res).toEqual([
      { id: 'topic-1', title: 'History', description: null },
      { id: 'topic-2', title: 'Science', description: null },
    ]);
  });

  it('lists topics with room availability', async () => {
    const { controller, lobby } = build();
    lobby.getRoomTopics.mockResolvedValue([
      { topic: makeTopic('topic-1'), takenByTeamId: 'team-1' },
      { topic: makeTopic('topic-2'), takenByTeamId: null },
    ]);
    const res = await controller.getRoomTopics('ABCDEF');
    expect(res[0].takenByTeamId).toBe('team-1');
    expect(res[1].takenByTeamId).toBeNull();
  });
});

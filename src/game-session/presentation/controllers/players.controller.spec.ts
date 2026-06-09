import { LobbyQueryService } from '../../application/queries';
import {
  JoinRoomUseCase,
  ReconnectClientUseCase,
  UpdateProfileUseCase,
} from '../../application/use-cases';
import {
  makePlayer,
  makeRoom,
} from '../../application/use-cases/lobby-test-doubles';
import { PlayersController } from './players.controller';

describe('PlayersController', () => {
  const build = () => {
    const joinRoom = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<JoinRoomUseCase>;
    const updateProfile = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateProfileUseCase>;
    const reconnectClient = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReconnectClientUseCase>;
    const lobby = {
      listPlayers: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const controller = new PlayersController(
      joinRoom,
      updateProfile,
      reconnectClient,
      lobby,
    );
    return { controller, joinRoom, updateProfile, reconnectClient, lobby };
  };

  it('joins the room and returns the player with the reconnect token', async () => {
    const { controller, joinRoom } = build();
    joinRoom.execute.mockResolvedValue(makePlayer());

    const res = await controller.create('ABCDEF', { name: 'Ann' });

    expect(joinRoom.execute).toHaveBeenCalledWith({
      code: 'ABCDEF',
      name: 'Ann',
    });
    expect(res.player.name).toBe('Ann');
    expect(res.reconnectToken).toBe('player-token');
  });

  it('lists players', async () => {
    const { controller, lobby } = build();
    lobby.listPlayers.mockResolvedValue([
      makePlayer(),
      makePlayer({ id: 'p2' }),
    ]);
    const res = await controller.list('ABCDEF');
    expect(res).toHaveLength(2);
  });

  it('returns the current player', () => {
    const { controller } = build();
    const res = controller.getMe(makePlayer({ id: 'p9', isCaptain: true }));
    expect(res.id).toBe('p9');
    expect(res.isCaptain).toBe(true);
  });

  it('updates the current player profile', async () => {
    const { controller, updateProfile } = build();
    updateProfile.execute.mockResolvedValue(makePlayer({ avatar: 'pic' }));

    const res = await controller.updateMe(makePlayer(), {
      name: 'New',
      avatar: 'pic',
    });

    expect(updateProfile.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      actingPlayerId: 'player-1',
      name: 'New',
      avatar: 'pic',
    });
    expect(res.avatar).toBe('pic');
  });

  it('reconnects the player and returns the snapshot', async () => {
    const { controller, reconnectClient } = build();
    reconnectClient.execute.mockResolvedValue({
      room: makeRoom(),
      players: [],
      teams: [],
    });

    const res = await controller.reconnect(makePlayer({ id: 'p1' }));

    expect(reconnectClient.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      principalHint: 'player',
      playerId: 'p1',
    });
    expect(res.room.id).toBe('room-1');
  });
});

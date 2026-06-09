import { LobbyQueryService } from '../../application/queries';
import {
  CloseRoomUseCase,
  CreateRoomUseCase,
  ReconnectClientUseCase,
} from '../../application/use-cases';
import {
  makePlayer,
  makeRoom,
  makeTeam,
} from '../../application/use-cases/lobby-test-doubles';
import { RoomsController } from './rooms.controller';

describe('RoomsController', () => {
  const build = () => {
    const createRoom = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateRoomUseCase>;
    const closeRoom = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CloseRoomUseCase>;
    const reconnectClient = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReconnectClientUseCase>;
    const lobby = {
      getRoom: jest.fn(),
      getRoomState: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const controller = new RoomsController(
      createRoom,
      closeRoom,
      reconnectClient,
      lobby,
    );
    return { controller, createRoom, closeRoom, reconnectClient, lobby };
  };

  it('creates a room and returns the host credentials once', async () => {
    const { controller, createRoom } = build();
    createRoom.execute.mockResolvedValue(makeRoom());

    const res = await controller.create();

    expect(res.room.code).toBe('ABCDEF');
    expect(res.hostId).toBe('host-1');
    expect(res.hostReconnectToken).toBe('host-token');
  });

  it('gets a room by code', async () => {
    const { controller, lobby } = build();
    lobby.getRoom.mockResolvedValue(makeRoom());
    const res = await controller.getByCode('ABCDEF');
    expect(lobby.getRoom).toHaveBeenCalledWith('ABCDEF');
    expect(res.code).toBe('ABCDEF');
  });

  it('gets the full room state', async () => {
    const { controller, lobby } = build();
    lobby.getRoomState.mockResolvedValue({
      room: makeRoom(),
      players: [makePlayer()],
      teams: [makeTeam()],
    });
    const res = await controller.getState('ABCDEF');
    expect(res.players).toHaveLength(1);
    expect(res.teams).toHaveLength(1);
  });

  it('gets the room status', async () => {
    const { controller, lobby } = build();
    lobby.getRoom.mockResolvedValue(makeRoom());
    const res = await controller.getStatus('ABCDEF');
    expect(res).toEqual({ status: 'ACTIVE', currentStage: 'LOBBY' });
  });

  it('reconnects the host and returns the snapshot', async () => {
    const { controller, reconnectClient } = build();
    reconnectClient.execute.mockResolvedValue({
      room: makeRoom(),
      players: [],
      teams: [],
    });
    const res = await controller.reconnectHost({
      roomId: 'room-1',
      hostId: 'host-1',
    });
    expect(reconnectClient.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      principalHint: 'host',
    });
    expect(res.room.id).toBe('room-1');
  });

  it('closes the room', async () => {
    const { controller, closeRoom } = build();
    closeRoom.execute.mockResolvedValue(makeRoom({ status: 'CLOSED' }));
    const res = await controller.close({ roomId: 'room-1', hostId: 'host-1' });
    expect(closeRoom.execute).toHaveBeenCalledWith({ roomId: 'room-1' });
    expect(res.status).toBe('CLOSED');
  });
});

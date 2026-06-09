import {
  InvalidPlayerNameError,
  InvalidRoomCodeError,
  PlayerNameTakenError,
  RoomNotActiveError,
  RoomNotFoundError,
} from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { JoinRoomUseCase } from './join-room.use-case';
import {
  makeClock,
  makeIdGenerator,
  makePlayerRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTokenGenerator,
} from './lobby-test-doubles';

describe('JoinRoomUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const players = makePlayerRepo();
    const realtime = makeRealtime();
    const uc = new JoinRoomUseCase(
      rooms,
      players,
      makeIdGenerator('player'),
      makeTokenGenerator(),
      makeClock(),
      realtime,
    );
    return { uc, rooms, players, realtime };
  };

  it('joins an active room and broadcasts player-joined', async () => {
    const { uc, rooms, players, realtime } = build();
    rooms.findByCode.mockResolvedValue(makeRoom());

    const player = await uc.execute({ code: 'ABCDEF', name: 'Bob' });

    expect(player.name.value).toBe('Bob');
    expect(player.roomId).toBe('room-1');
    expect(player.reconnectToken.value).toBe('token-1');
    expect(players.create).toHaveBeenCalledWith(player);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameSessionEvent.PlayerJoined,
      expect.objectContaining({ roomId: 'room-1' }),
    );
  });

  it('rejects an unknown room code', async () => {
    const { uc, rooms } = build();
    rooms.findByCode.mockResolvedValue(null);
    await expect(
      uc.execute({ code: 'ABCDEF', name: 'Bob' }),
    ).rejects.toBeInstanceOf(RoomNotFoundError);
  });

  it('refuses to join a closed room', async () => {
    const { uc, rooms } = build();
    rooms.findByCode.mockResolvedValue(makeRoom({ status: 'CLOSED' }));
    await expect(
      uc.execute({ code: 'ABCDEF', name: 'Bob' }),
    ).rejects.toBeInstanceOf(RoomNotActiveError);
  });

  it('rejects an invalid room code before any lookup', async () => {
    const { uc, rooms } = build();
    await expect(
      uc.execute({ code: '@@', name: 'Bob' }),
    ).rejects.toBeInstanceOf(InvalidRoomCodeError);
    expect(rooms.findByCode).not.toHaveBeenCalled();
  });

  it('rejects an empty player name', async () => {
    const { uc, rooms } = build();
    rooms.findByCode.mockResolvedValue(makeRoom());
    await expect(
      uc.execute({ code: 'ABCDEF', name: '   ' }),
    ).rejects.toBeInstanceOf(InvalidPlayerNameError);
  });

  it('propagates a duplicate-name violation from the repository', async () => {
    const { uc, rooms, players } = build();
    rooms.findByCode.mockResolvedValue(makeRoom());
    players.create.mockRejectedValue(new PlayerNameTakenError());
    await expect(
      uc.execute({ code: 'ABCDEF', name: 'Bob' }),
    ).rejects.toBeInstanceOf(PlayerNameTakenError);
  });
});

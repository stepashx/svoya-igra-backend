import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { GameSessionEvent } from '../events';
import { CloseRoomUseCase } from './close-room.use-case';
import {
  makeClock,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
} from './lobby-test-doubles';

describe('CloseRoomUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const realtime = makeRealtime();
    const uc = new CloseRoomUseCase(rooms, makeClock(), realtime);
    return { uc, rooms, realtime };
  };

  it('closes an active room and broadcasts room-closed', async () => {
    const { uc, rooms, realtime } = build();
    const room = makeRoom();
    rooms.findById.mockResolvedValue(room);

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result.status).toBe('CLOSED');
    expect(rooms.update).toHaveBeenCalledWith(room);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameSessionEvent.RoomClosed,
      expect.objectContaining({ roomId: 'room-1' }),
    );
  });

  it('rejects closing a room that is not active', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(makeRoom({ status: 'CLOSED' }));
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
  });

  it('rejects an unknown room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(null);
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });
});

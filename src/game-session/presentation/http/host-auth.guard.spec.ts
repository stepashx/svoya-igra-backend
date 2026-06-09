import { ExecutionContext } from '@nestjs/common';
import {
  InvalidRoomCodeError,
  NotRoomHostError,
  RoomNotFoundError,
} from '../../domain/errors';
import {
  makeRoom,
  makeRoomRepo,
} from '../../application/use-cases/lobby-test-doubles';
import { HostAuthGuard } from './host-auth.guard';
import { LobbyRequest } from './request-context';

describe('HostAuthGuard', () => {
  const contextFor = (request: LobbyRequest): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const build = () => {
    const rooms = makeRoomRepo();
    rooms.findByCode.mockResolvedValue(makeRoom());
    return { guard: new HostAuthGuard(rooms), rooms };
  };

  it('authorises a valid host token and attaches the host context', async () => {
    const { guard } = build();
    const request: LobbyRequest = {
      params: { code: 'ABCDEF' },
      headers: { 'x-host-token': 'host-token' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.hostContext).toEqual({ roomId: 'room-1', hostId: 'host-1' });
  });

  it('rejects a missing token', async () => {
    const { guard } = build();
    await expect(
      guard.canActivate(
        contextFor({ params: { code: 'ABCDEF' }, headers: {} }),
      ),
    ).rejects.toBeInstanceOf(NotRoomHostError);
  });

  it('rejects a wrong token', async () => {
    const { guard } = build();
    await expect(
      guard.canActivate(
        contextFor({
          params: { code: 'ABCDEF' },
          headers: { 'x-host-token': 'nope' },
        }),
      ),
    ).rejects.toBeInstanceOf(NotRoomHostError);
  });

  it('rejects an unknown room', async () => {
    const { guard, rooms } = build();
    rooms.findByCode.mockResolvedValue(null);
    await expect(
      guard.canActivate(
        contextFor({
          params: { code: 'ABCDEF' },
          headers: { 'x-host-token': 'host-token' },
        }),
      ),
    ).rejects.toBeInstanceOf(RoomNotFoundError);
  });

  it('rejects an invalid room code', async () => {
    const { guard, rooms } = build();
    await expect(
      guard.canActivate(
        contextFor({
          params: { code: '@@' },
          headers: { 'x-host-token': 'host-token' },
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidRoomCodeError);
    expect(rooms.findByCode).not.toHaveBeenCalled();
  });
});

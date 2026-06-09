import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ForbiddenError } from '../../../core/errors/app.error';
import { RoomNotFoundError } from '../../domain/errors';
import {
  makePlayer,
  makePlayerRepo,
  makeRoom,
  makeRoomRepo,
} from '../../application/use-cases/lobby-test-doubles';
import { PlayerIdentityGuard } from './player-identity.guard';
import { LobbyRequest } from './request-context';

describe('PlayerIdentityGuard', () => {
  const contextFor = (request: LobbyRequest): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const build = () => {
    const players = makePlayerRepo();
    const rooms = makeRoomRepo();
    players.findByReconnectToken.mockResolvedValue(
      makePlayer({ id: 'p1', roomId: 'room-1' }),
    );
    rooms.findByCode.mockResolvedValue(makeRoom());
    return { guard: new PlayerIdentityGuard(players, rooms), players, rooms };
  };

  const requestWith = (token?: string): LobbyRequest => ({
    params: { code: 'ABCDEF' },
    headers: token === undefined ? {} : { 'x-player-token': token },
  });

  it('authenticates a valid token and attaches the player', async () => {
    const { guard } = build();
    const request = requestWith('player-token');
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.player?.id).toBe('p1');
  });

  it('rejects a missing token with 401', async () => {
    const { guard } = build();
    await expect(
      guard.canActivate(contextFor(requestWith())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed token with 401', async () => {
    const { guard } = build();
    await expect(
      guard.canActivate(contextFor(requestWith('not a token!'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown token with 401', async () => {
    const { guard, players } = build();
    players.findByReconnectToken.mockResolvedValue(null);
    await expect(
      guard.canActivate(contextFor(requestWith('player-token'))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a player from another room with 403', async () => {
    const { guard, players } = build();
    players.findByReconnectToken.mockResolvedValue(
      makePlayer({ id: 'p1', roomId: 'other-room' }),
    );
    await expect(
      guard.canActivate(contextFor(requestWith('player-token'))),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects an unknown room with 404', async () => {
    const { guard, rooms } = build();
    rooms.findByCode.mockResolvedValue(null);
    await expect(
      guard.canActivate(contextFor(requestWith('player-token'))),
    ).rejects.toBeInstanceOf(RoomNotFoundError);
  });
});

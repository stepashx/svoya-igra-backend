import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ForbiddenError } from '../../../core/errors/app.error';
import { NotRoomHostError, RoomNotFoundError } from '../../domain/errors';
import {
  makePlayer,
  makePlayerRepo,
  makeRoom,
  makeRoomRepo,
} from '../../application/use-cases/lobby-test-doubles';
import { TeamMemberOrHostGuard } from './team-member-or-host.guard';
import { LobbyRequest } from './request-context';

describe('TeamMemberOrHostGuard', () => {
  const contextFor = (request: LobbyRequest): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const build = () => {
    const players = makePlayerRepo();
    const rooms = makeRoomRepo();
    // Default player: member of room-1 / team-1.
    players.findByReconnectToken.mockResolvedValue(
      makePlayer({ id: 'p1', roomId: 'room-1', teamId: 'team-1' }),
    );
    rooms.findByCode.mockResolvedValue(makeRoom()); // host token 'host-token'
    return { guard: new TeamMemberOrHostGuard(players, rooms), players, rooms };
  };

  const requestWith = (
    headers: Record<string, string>,
    teamId = 'team-1',
  ): LobbyRequest => ({
    params: { code: 'ABCDEF', teamId },
    headers,
  });

  /* --- Host path -------------------------------------------------------- */

  it('admits the host with the correct host token (no player lookup)', async () => {
    const { guard, players } = build();
    const request = requestWith({ 'x-host-token': 'host-token' });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(players.findByReconnectToken).not.toHaveBeenCalled();
    expect(request.hostContext?.roomId).toBe('room-1');
  });

  it('rejects a wrong host token WITHOUT falling through to a valid player', async () => {
    const { guard, players } = build();
    const request = requestWith({
      'x-host-token': 'wrong',
      'x-player-token': 'player-token',
    });

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      NotRoomHostError,
    );
    // No fallthrough: the present host credential is judged on its own.
    expect(players.findByReconnectToken).not.toHaveBeenCalled();
  });

  it('treats an empty host token as present-and-wrong (403, no fallthrough)', async () => {
    const { guard, players } = build();
    const request = requestWith({
      'x-host-token': '',
      'x-player-token': 'player-token',
    });

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      NotRoomHostError,
    );
    expect(players.findByReconnectToken).not.toHaveBeenCalled();
  });

  /* --- Player path ------------------------------------------------------ */

  it('admits a team member with a matching team id', async () => {
    const { guard } = build();
    const request = requestWith({ 'x-player-token': 'player-token' });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.player?.id).toBe('p1');
  });

  it('rejects a player with no team (403)', async () => {
    const { guard, players } = build();
    players.findByReconnectToken.mockResolvedValue(
      makePlayer({ id: 'p1', roomId: 'room-1', teamId: null }),
    );

    await expect(
      guard.canActivate(
        contextFor(requestWith({ 'x-player-token': 'player-token' })),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a player of a different team (403)', async () => {
    const { guard, players } = build();
    players.findByReconnectToken.mockResolvedValue(
      makePlayer({ id: 'p1', roomId: 'room-1', teamId: 'team-2' }),
    );

    await expect(
      guard.canActivate(
        contextFor(requestWith({ 'x-player-token': 'player-token' })),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a player from another room (403)', async () => {
    const { guard, players } = build();
    players.findByReconnectToken.mockResolvedValue(
      makePlayer({ id: 'p1', roomId: 'other-room', teamId: 'team-1' }),
    );

    await expect(
      guard.canActivate(
        contextFor(requestWith({ 'x-player-token': 'player-token' })),
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects a missing player token with 401 (no host token present)', async () => {
    const { guard } = build();

    await expect(
      guard.canActivate(contextFor(requestWith({}))),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown player token with 401', async () => {
    const { guard, players } = build();
    players.findByReconnectToken.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextFor(requestWith({ 'x-player-token': 'player-token' })),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  /* --- Room resolution -------------------------------------------------- */

  it('rejects an unknown room with 404', async () => {
    const { guard, rooms } = build();
    rooms.findByCode.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        contextFor(requestWith({ 'x-host-token': 'host-token' })),
      ),
    ).rejects.toBeInstanceOf(RoomNotFoundError);
  });
});

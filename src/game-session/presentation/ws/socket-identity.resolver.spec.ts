import {
  makePlayer,
  makePlayerRepo,
  makeRoom,
  makeRoomRepo,
} from '../../application/use-cases/lobby-test-doubles';
import { SocketIdentityResolver } from './socket-identity.resolver';

describe('SocketIdentityResolver', () => {
  const build = () => {
    const players = makePlayerRepo();
    const rooms = makeRoomRepo();
    const resolver = new SocketIdentityResolver(players, rooms);
    return { resolver, players, rooms };
  };

  it('resolves a player by reconnect token', async () => {
    const { resolver, players, rooms } = build();
    players.findByReconnectToken.mockResolvedValue(
      makePlayer({ id: 'player-1', roomId: 'room-1' }),
    );

    const identity = await resolver.resolve('player-token');

    expect(identity).toEqual({
      principal: 'player',
      roomId: 'room-1',
      playerId: 'player-1',
    });
    // Player matched first — the host slot is never queried.
    expect(rooms.findByHostReconnectToken).not.toHaveBeenCalled();
  });

  it('falls back to the host slot when no player matches', async () => {
    const { resolver, rooms } = build();
    rooms.findByHostReconnectToken.mockResolvedValue(
      makeRoom({ id: 'room-1' }),
    );

    const identity = await resolver.resolve('host-token');

    expect(identity).toEqual({ principal: 'host', roomId: 'room-1' });
  });

  it('returns null for a malformed token without hitting the repositories', async () => {
    const { resolver, players, rooms } = build();

    expect(await resolver.resolve('not a token!')).toBeNull();
    expect(await resolver.resolve('')).toBeNull();
    expect(await resolver.resolve(undefined)).toBeNull();

    expect(players.findByReconnectToken).not.toHaveBeenCalled();
    expect(rooms.findByHostReconnectToken).not.toHaveBeenCalled();
  });

  it('returns null for a well-formed but unknown token', async () => {
    const { resolver } = build();
    // Both repos default to resolving null.
    expect(await resolver.resolve('unknown-token')).toBeNull();
  });
});

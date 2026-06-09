import {
  LobbyPresenceRegistry,
  presenceIdentityKey,
} from './lobby-presence.registry';
import { ResolvedSocketIdentity } from './socket-identity.resolver';

const player = (
  playerId: string,
  roomId = 'room-1',
): ResolvedSocketIdentity => ({
  principal: 'player',
  roomId,
  playerId,
});

const host = (roomId: string): ResolvedSocketIdentity => ({
  principal: 'host',
  roomId,
});

describe('presenceIdentityKey', () => {
  it('keys a player by id and the host by room', () => {
    expect(presenceIdentityKey(player('p1'))).toBe('p:p1');
    expect(presenceIdentityKey(host('room-9'))).toBe('h:room-9');
  });
});

describe('LobbyPresenceRegistry', () => {
  const make = () => new LobbyPresenceRegistry();

  it('registers a socket and reports last-for-identity on unregister', () => {
    const reg = make();
    reg.register('s1', player('p1'));
    expect(reg.has('s1')).toBe(true);

    const removal = reg.unregister('s1');
    expect(removal.entry?.identity).toEqual(player('p1'));
    expect(removal.lastForIdentity).toBe(true);
    expect(reg.has('s1')).toBe(false);
  });

  it('treats multiple tabs of one player as a single identity', () => {
    const reg = make();
    reg.register('s1', player('p1'));
    reg.register('s2', player('p1'));
    expect(reg.socketsForIdentity('p:p1')).toHaveLength(2);

    // First tab closes — identity still present.
    expect(reg.unregister('s1').lastForIdentity).toBe(false);
    expect(reg.socketsForIdentity('p:p1')).toEqual(['s2']);

    // Last tab closes — now it is the last socket.
    expect(reg.unregister('s2').lastForIdentity).toBe(true);
    expect(reg.socketsForIdentity('p:p1')).toEqual([]);
  });

  it('keeps distinct players independent', () => {
    const reg = make();
    reg.register('s1', player('p1'));
    reg.register('s2', player('p2'));

    expect(reg.unregister('s1').lastForIdentity).toBe(true);
    expect(reg.has('s2')).toBe(true);
    expect(reg.socketsForIdentity('p:p2')).toEqual(['s2']);
  });

  it('keys the host by room', () => {
    const reg = make();
    reg.register('s1', host('room-1'));
    expect(reg.socketsForIdentity('h:room-1')).toEqual(['s1']);

    const removal = reg.unregister('s1');
    expect(removal.entry?.identity).toEqual(host('room-1'));
    expect(removal.lastForIdentity).toBe(true);
  });

  it('returns a null entry when unregistering an unknown socket', () => {
    const reg = make();
    expect(reg.unregister('ghost')).toEqual({
      entry: null,
      lastForIdentity: false,
    });
  });

  it('replaces a re-registered socket id without leaking the reverse index', () => {
    const reg = make();
    reg.register('s1', player('p1'));
    reg.register('s1', player('p2'));

    expect(reg.socketsForIdentity('p:p1')).toEqual([]);
    expect(reg.socketsForIdentity('p:p2')).toEqual(['s1']);
  });
});

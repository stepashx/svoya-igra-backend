import { RealtimeEventsPort } from '../../../core/ports/realtime-events.port';
import { PresenceHostRealtimeEventsAdapter } from './host-realtime-events.adapter';
import { LobbyPresenceRegistry } from './lobby-presence.registry';
import { ResolvedSocketIdentity } from './socket-identity.resolver';

const host = (roomId: string): ResolvedSocketIdentity => ({
  principal: 'host',
  roomId,
});

const player = (
  playerId: string,
  roomId = 'room-1',
): ResolvedSocketIdentity => ({
  principal: 'player',
  roomId,
  playerId,
});

describe('PresenceHostRealtimeEventsAdapter', () => {
  const build = () => {
    const presence = new LobbyPresenceRegistry();
    const realtime: jest.Mocked<RealtimeEventsPort> = {
      emitToRoom: jest.fn(),
      emitToClient: jest.fn(),
    };
    const adapter = new PresenceHostRealtimeEventsAdapter(presence, realtime);
    return { presence, realtime, adapter };
  };

  it('emits to every live host socket with the same event and payload', () => {
    const { presence, realtime, adapter } = build();
    presence.register('h1', host('room-1'));
    presence.register('h2', host('room-1'));
    const payload = { roomId: 'room-1', cellId: 'cell-1' };

    adapter.emitToHost('room-1', 'server:gameplay:some-event', payload);

    expect(realtime.emitToClient).toHaveBeenCalledTimes(2);
    expect(realtime.emitToClient).toHaveBeenCalledWith(
      'h1',
      'server:gameplay:some-event',
      payload,
    );
    expect(realtime.emitToClient).toHaveBeenCalledWith(
      'h2',
      'server:gameplay:some-event',
      payload,
    );
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it('is a silent no-op when the room has no host socket', () => {
    const { realtime, adapter } = build();

    expect(() =>
      adapter.emitToHost('room-1', 'server:gameplay:some-event', {}),
    ).not.toThrow();
    expect(realtime.emitToClient).not.toHaveBeenCalled();
  });

  it('never addresses player sockets of the room', () => {
    const { presence, realtime, adapter } = build();
    presence.register('s1', player('p1', 'room-1'));
    presence.register('h1', host('room-1'));

    adapter.emitToHost('room-1', 'server:gameplay:some-event', {});

    expect(realtime.emitToClient).toHaveBeenCalledTimes(1);
    expect(realtime.emitToClient).toHaveBeenCalledWith(
      'h1',
      'server:gameplay:some-event',
      {},
    );
  });
});

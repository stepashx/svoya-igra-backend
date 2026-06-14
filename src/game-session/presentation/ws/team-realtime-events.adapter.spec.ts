import { RealtimeEventsPort } from '../../../core/ports/realtime-events.port';
import { Player } from '../../domain/entities';
import { PlayerRepositoryPort } from '../../domain/ports';
import { LobbyPresenceRegistry } from './lobby-presence.registry';
import { PresenceTeamRealtimeEventsAdapter } from './team-realtime-events.adapter';
import { ResolvedSocketIdentity } from './socket-identity.resolver';

const player = (
  playerId: string,
  roomId = 'room-1',
): ResolvedSocketIdentity => ({
  principal: 'player',
  roomId,
  playerId,
});

/** A roster member — the adapter only ever reads `id`. */
const member = (id: string): Player => ({ id }) as unknown as Player;

describe('PresenceTeamRealtimeEventsAdapter', () => {
  const build = () => {
    const presence = new LobbyPresenceRegistry();
    const players: jest.Mocked<PlayerRepositoryPort> = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findByReconnectToken: jest.fn(),
      findByRoomId: jest.fn(),
      findByRoomIdAndName: jest.fn(),
      findByTeamId: jest.fn().mockResolvedValue([]),
      countByTeamId: jest.fn(),
    };
    const realtime: jest.Mocked<RealtimeEventsPort> = {
      emitToRoom: jest.fn(),
      emitToClient: jest.fn(),
    };
    const adapter = new PresenceTeamRealtimeEventsAdapter(
      players,
      presence,
      realtime,
    );
    return { presence, players, realtime, adapter };
  };

  it('fans out to every live socket of every team member', async () => {
    const { presence, players, realtime, adapter } = build();
    presence.register('s1', player('p1'));
    presence.register('s2', player('p1')); // a second tab of p1
    presence.register('s3', player('p2'));
    players.findByTeamId.mockResolvedValue([member('p1'), member('p2')]);
    const payload = { roomId: 'room-1', teamId: 'team-1' };

    await adapter.emitToTeam(
      'team-1',
      'server:commerce:inventory-updated',
      payload,
    );

    expect(players.findByTeamId).toHaveBeenCalledWith('team-1');
    expect(realtime.emitToClient).toHaveBeenCalledTimes(3);
    for (const socketId of ['s1', 's2', 's3']) {
      expect(realtime.emitToClient).toHaveBeenCalledWith(
        socketId,
        'server:commerce:inventory-updated',
        payload,
      );
    }
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it('is a silent no-op when no member has a live socket', async () => {
    const { players, realtime, adapter } = build();
    players.findByTeamId.mockResolvedValue([member('p1')]);

    await expect(
      adapter.emitToTeam('team-1', 'server:commerce:inventory-updated', {}),
    ).resolves.toBeUndefined();
    expect(realtime.emitToClient).not.toHaveBeenCalled();
  });

  it('never addresses sockets of players outside the team', async () => {
    const { presence, players, realtime, adapter } = build();
    presence.register('s1', player('p1'));
    presence.register('s2', player('other'));
    players.findByTeamId.mockResolvedValue([member('p1')]);

    await adapter.emitToTeam('team-1', 'server:commerce:inventory-updated', {});

    expect(realtime.emitToClient).toHaveBeenCalledTimes(1);
    expect(realtime.emitToClient).toHaveBeenCalledWith(
      's1',
      'server:commerce:inventory-updated',
      {},
    );
  });

  it('swallows and logs a roster-lookup failure (never fails the purchase)', async () => {
    const { players, realtime, adapter } = build();
    players.findByTeamId.mockRejectedValue(new Error('db down'));

    await expect(
      adapter.emitToTeam('team-1', 'server:commerce:inventory-updated', {}),
    ).resolves.toBeUndefined();
    expect(realtime.emitToClient).not.toHaveBeenCalled();
  });
});

import { PlayerName, ReconnectToken } from '../value-objects';
import { Player } from './player';

describe('Player', () => {
  const joinedAt = new Date('2026-01-01T00:00:00.000Z');

  const makePlayer = (): Player =>
    Player.create(
      {
        id: 'player-1',
        roomId: 'room-1',
        name: PlayerName.create('Alice'),
        reconnectToken: ReconnectToken.create('player-token'),
      },
      joinedAt,
    );

  it('creates a connected, unassigned, non-captain player', () => {
    const player = makePlayer();
    expect(player.connectionStatus).toBe('CONNECTED');
    expect(player.teamId).toBeNull();
    expect(player.isCaptain).toBe(false);
    expect(player.avatar).toBeNull();
    expect(player.joinedAt).toBe(joinedAt);
    expect(player.lastSeenAt).toBe(joinedAt);
  });

  it('joins and leaves a team', () => {
    const player = makePlayer();
    player.joinTeam('team-1');
    expect(player.teamId).toBe('team-1');
    player.leaveTeam();
    expect(player.teamId).toBeNull();
  });

  it('promotes to captain idempotently, with no demote', () => {
    const player = makePlayer();
    player.promoteToCaptain();
    expect(player.isCaptain).toBe(true);
    player.promoteToCaptain();
    expect(player.isCaptain).toBe(true);
  });

  it('bumps lastSeenAt when disconnecting and reconnecting', () => {
    const player = makePlayer();

    const t1 = new Date('2026-01-01T00:05:00.000Z');
    player.markDisconnected(t1);
    expect(player.connectionStatus).toBe('DISCONNECTED');
    expect(player.lastSeenAt).toBe(t1);

    const t2 = new Date('2026-01-01T00:06:00.000Z');
    player.markConnected(t2);
    expect(player.connectionStatus).toBe('CONNECTED');
    expect(player.lastSeenAt).toBe(t2);
  });

  it('touch bumps lastSeenAt without changing connection status', () => {
    const player = makePlayer();
    const t = new Date('2026-01-01T00:07:00.000Z');
    player.touch(t);
    expect(player.lastSeenAt).toBe(t);
    expect(player.connectionStatus).toBe('CONNECTED');
  });

  it('renames and changes avatar', () => {
    const player = makePlayer();
    player.rename(PlayerName.create('Bob'));
    expect(player.name.value).toBe('Bob');
    player.changeAvatar('avatar.png');
    expect(player.avatar).toBe('avatar.png');
  });
});

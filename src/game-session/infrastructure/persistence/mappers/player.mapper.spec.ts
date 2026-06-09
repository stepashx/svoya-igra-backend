import { players } from '../../../../infrastructure/database/schema';
import {
  mapPlayerToInsert,
  mapPlayerToUpdate,
  mapRowToPlayer,
} from './player.mapper';

describe('player.mapper', () => {
  const row: typeof players.$inferSelect = {
    id: 'player-1',
    roomId: 'room-1',
    teamId: null,
    name: 'Alice',
    avatar: null,
    reconnectToken: 'player-token',
    connectionStatus: 'CONNECTED',
    isCaptain: false,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
    lastSeenAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('round-trips a row through the entity back to an insert payload', () => {
    const player = mapRowToPlayer(row);
    expect(player.name.value).toBe('Alice');
    expect(player.teamId).toBeNull();
    expect(player.reconnectToken.value).toBe('player-token');

    expect(mapPlayerToInsert(player)).toEqual({
      id: 'player-1',
      roomId: 'room-1',
      teamId: null,
      name: 'Alice',
      avatar: null,
      reconnectToken: 'player-token',
      connectionStatus: 'CONNECTED',
      isCaptain: false,
      joinedAt: row.joinedAt,
      lastSeenAt: row.lastSeenAt,
    });
  });

  it('maps only mutable columns to an update payload', () => {
    const player = mapRowToPlayer({
      ...row,
      teamId: 'team-2',
      isCaptain: true,
    });
    const update = mapPlayerToUpdate(player);
    expect(update).toEqual({
      teamId: 'team-2',
      name: 'Alice',
      avatar: null,
      connectionStatus: 'CONNECTED',
      isCaptain: true,
      lastSeenAt: row.lastSeenAt,
    });
    expect(update).not.toHaveProperty('reconnectToken');
    expect(update).not.toHaveProperty('joinedAt');
  });
});

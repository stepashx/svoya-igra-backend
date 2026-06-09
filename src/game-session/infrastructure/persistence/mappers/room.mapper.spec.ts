import { rooms } from '../../../../infrastructure/database/schema';
import { mapRoomToInsert, mapRoomToUpdate, mapRowToRoom } from './room.mapper';

describe('room.mapper', () => {
  const row: typeof rooms.$inferSelect = {
    id: 'room-1',
    code: 'ABCDE',
    status: 'ACTIVE',
    currentStage: 'LOBBY',
    hostId: 'host-1',
    hostReconnectToken: 'host-token',
    currentTeamId: null,
    totalQuestionsCount: 30,
    blockedQuestionsCount: 0,
    currentShopRound: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    finishedAt: null,
  };

  it('round-trips a row through the entity back to an insert payload', () => {
    const room = mapRowToRoom(row);
    expect(room.id).toBe('room-1');
    expect(room.code.value).toBe('ABCDE');
    expect(room.hostReconnectToken.value).toBe('host-token');
    expect(room.currentTeamId).toBeNull();
    expect(room.createdAt).toBe(row.createdAt);

    expect(mapRoomToInsert(room)).toEqual({
      id: 'room-1',
      code: 'ABCDE',
      status: 'ACTIVE',
      currentStage: 'LOBBY',
      hostId: 'host-1',
      hostReconnectToken: 'host-token',
      currentTeamId: null,
      totalQuestionsCount: 30,
      blockedQuestionsCount: 0,
      currentShopRound: 0,
      createdAt: row.createdAt,
      finishedAt: null,
    });
  });

  it('maps only mutable columns to an update payload', () => {
    const room = mapRowToRoom({
      ...row,
      currentStage: 'TEAM_SETUP',
      currentTeamId: 'team-9',
    });
    const update = mapRoomToUpdate(room);
    expect(update).toEqual({
      status: 'ACTIVE',
      currentStage: 'TEAM_SETUP',
      currentTeamId: 'team-9',
      blockedQuestionsCount: 0,
      currentShopRound: 0,
      finishedAt: null,
    });
    expect(update).not.toHaveProperty('id');
    expect(update).not.toHaveProperty('code');
    expect(update).not.toHaveProperty('hostReconnectToken');
  });
});

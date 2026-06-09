import { teams } from '../../../../infrastructure/database/schema';
import { mapRowToTeam, mapTeamToInsert, mapTeamToUpdate } from './team.mapper';

describe('team.mapper', () => {
  const row: typeof teams.$inferSelect = {
    id: 'team-1',
    roomId: 'room-1',
    name: 'Red',
    captainPlayerId: null,
    selectedTopicId: null,
    isReady: false,
    turnOrder: null,
    earnedScore: 0,
    balance: 0,
    presentationSubmissionId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  it('round-trips a row through the entity back to an insert, wrapping scores', () => {
    const team = mapRowToTeam({ ...row, earnedScore: 400, balance: 200 });
    expect(team.name.value).toBe('Red');
    expect(team.earnedScore.value).toBe(400);
    expect(team.balance.value).toBe(200);

    expect(mapTeamToInsert(team)).toEqual({
      id: 'team-1',
      roomId: 'room-1',
      name: 'Red',
      captainPlayerId: null,
      selectedTopicId: null,
      isReady: false,
      turnOrder: null,
      earnedScore: 400,
      balance: 200,
      presentationSubmissionId: null,
      createdAt: row.createdAt,
    });
  });

  it('maps only mutable columns to an update payload (name excluded)', () => {
    const team = mapRowToTeam({
      ...row,
      captainPlayerId: 'player-1',
      isReady: true,
    });
    const update = mapTeamToUpdate(team);
    expect(update).toEqual({
      captainPlayerId: 'player-1',
      selectedTopicId: null,
      isReady: true,
      turnOrder: null,
      earnedScore: 0,
      balance: 0,
      presentationSubmissionId: null,
    });
    expect(update).not.toHaveProperty('name');
    expect(update).not.toHaveProperty('createdAt');
  });
});

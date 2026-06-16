import { finalResults } from '../../../../infrastructure/database/schema';
import { FinalResult } from '../../../domain/entities';
import {
  mapFinalResultToInsert,
  mapRowToFinalResult,
} from './final-result.mapper';

describe('final-result.mapper', () => {
  const calculatedAt = new Date('2026-06-16T12:30:00.000Z');

  it('maps a row to an entity, carrying the derived doubles verbatim', () => {
    const row: typeof finalResults.$inferSelect = {
      id: 'fr-1',
      roomId: 'room-1',
      teamId: 'team-1',
      earnedScore: 100,
      presentationScoreRaw: 7.6666666,
      latePenalty: 1,
      presentationScoreFinal: 6.6666666,
      finalScore: 666.66666,
      place: 2,
      calculatedAt,
    };
    const result = mapRowToFinalResult(row);
    expect(result.id).toBe('fr-1');
    expect(result.earnedScore).toBe(100);
    expect(result.presentationScoreRaw).toBe(7.6666666);
    expect(result.latePenalty).toBe(1);
    expect(result.presentationScoreFinal).toBe(6.6666666);
    expect(result.finalScore).toBe(666.66666);
    expect(result.place).toBe(2);
    expect(result.calculatedAt).toBe(calculatedAt);
  });

  it('maps a fresh entity to a full insert payload, round-trip (int vs double preserved)', () => {
    const result = FinalResult.create(
      {
        id: 'fr-2',
        roomId: 'room-1',
        teamId: 'team-2',
        earnedScore: 100,
        presentationScoreRaw: 8,
        latePenalty: 1,
        place: 1,
      },
      calculatedAt,
    );
    const insert = mapFinalResultToInsert(result);
    expect(insert).toEqual({
      id: 'fr-2',
      roomId: 'room-1',
      teamId: 'team-2',
      earnedScore: 100,
      presentationScoreRaw: 8,
      latePenalty: 1,
      presentationScoreFinal: 7,
      finalScore: 700,
      place: 1,
      calculatedAt,
    });
    // Round-trip: the insert payload rehydrates to an equal entity.
    expect(
      mapRowToFinalResult(insert as typeof finalResults.$inferSelect),
    ).toEqual(result);
  });

  it('carries a zero latePenalty (non-null) for a team with no submission', () => {
    const result = FinalResult.create(
      {
        id: 'fr-3',
        roomId: 'room-1',
        teamId: 'team-3',
        earnedScore: 50,
        presentationScoreRaw: 5,
        latePenalty: 0,
        place: 1,
      },
      calculatedAt,
    );
    const insert = mapFinalResultToInsert(result);
    expect(insert.latePenalty).toBe(0);
    expect(insert.latePenalty).not.toBeUndefined();
  });
});

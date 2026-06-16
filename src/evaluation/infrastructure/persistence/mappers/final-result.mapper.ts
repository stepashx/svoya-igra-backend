import { finalResults } from '../../../../infrastructure/database/schema';
import { FinalResult } from '../../../domain/entities';

type FinalResultRow = typeof finalResults.$inferSelect;
type FinalResultInsert = typeof finalResults.$inferInsert;

/**
 * Row → entity. `reconstitute` passes every column through unchanged — the
 * derived `presentationScoreFinal`/`finalScore` are read back as stored, never
 * recomputed (the use case already derived them through
 * {@link FinalResult.deriveScores} at create time).
 */
export function mapRowToFinalResult(row: FinalResultRow): FinalResult {
  return FinalResult.reconstitute({
    id: row.id,
    roomId: row.roomId,
    teamId: row.teamId,
    earnedScore: row.earnedScore,
    presentationScoreRaw: row.presentationScoreRaw,
    latePenalty: row.latePenalty,
    presentationScoreFinal: row.presentationScoreFinal,
    finalScore: row.finalScore,
    place: row.place,
    calculatedAt: row.calculatedAt,
  });
}

/**
 * Entity → full insert payload (every column, the column default for
 * `calculated_at` is never relied upon). `latePenalty` is always a number on the
 * entity — 0 for a team with no presentation submission — so the NOT NULL double
 * column never sees `undefined`.
 */
export function mapFinalResultToInsert(result: FinalResult): FinalResultInsert {
  return {
    id: result.id,
    roomId: result.roomId,
    teamId: result.teamId,
    earnedScore: result.earnedScore,
    presentationScoreRaw: result.presentationScoreRaw,
    latePenalty: result.latePenalty,
    presentationScoreFinal: result.presentationScoreFinal,
    finalScore: result.finalScore,
    place: result.place,
    calculatedAt: result.calculatedAt,
  };
}

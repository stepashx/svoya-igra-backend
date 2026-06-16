import {
  ResultsEntry,
  ResultsView,
} from '../../../evaluation/application/queries';
import { LeaderboardEntryDto, ResultsResponseDto } from '../dto/response';

/** Leaderboard entry view → DTO (public aggregates; no individual scores). */
export function toLeaderboardEntry(entry: ResultsEntry): LeaderboardEntryDto {
  return {
    teamId: entry.teamId,
    teamName: entry.teamName,
    earnedScore: entry.earnedScore,
    presentationScoreRaw: entry.presentationScoreRaw,
    latePenalty: entry.latePenalty,
    presentationScoreFinal: entry.presentationScoreFinal,
    finalScore: entry.finalScore,
    place: entry.place,
  };
}

/** Results view → response DTO (`POST results` reply / `GET results` read). */
export function toResultsResponse(view: ResultsView): ResultsResponseDto {
  return { leaderboard: view.leaderboard.map(toLeaderboardEntry) };
}

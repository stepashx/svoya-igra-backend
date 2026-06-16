import { Inject, Injectable } from '@nestjs/common';
import { FinalResult } from '../../domain/entities';
import {
  EVALUATION_FINAL_RESULT_REPOSITORY_PORT,
  FinalResultRepositoryPort,
} from '../../domain/ports';

/**
 * One team's row on the final leaderboard (plan §14.10, §15.11) — public
 * AGGREGATES only. The individual `evaluation_scores` stay private (§16.8
 * "intrigue"); the leaderboard reveals the computed result, never who scored
 * whom what.
 */
export interface ResultsEntry {
  teamId: string;
  teamName: string;
  earnedScore: number;
  presentationScoreRaw: number;
  latePenalty: number;
  presentationScoreFinal: number;
  finalScore: number;
  place: number;
}

/** The final leaderboard — entries ordered `(place, teamId)`. */
export interface ResultsView {
  leaderboard: ResultsEntry[];
}

/**
 * Project one {@link FinalResult} (+ its team name) onto a leaderboard entry.
 * The SINGLE place results turn into the public shape — both the
 * {@link ResultsQueryService} (the GET read) and {@link CalculateResultsUseCase}
 * (the in-memory POST reply built before commit) call it, so the two surfaces
 * cannot drift.
 */
export function toResultsEntry(
  result: FinalResult,
  teamName: string,
): ResultsEntry {
  return {
    teamId: result.teamId,
    teamName,
    earnedScore: result.earnedScore,
    presentationScoreRaw: result.presentationScoreRaw,
    latePenalty: result.latePenalty,
    presentationScoreFinal: result.presentationScoreFinal,
    finalScore: result.finalScore,
    place: result.place,
  };
}

/**
 * Stateless read model for the final leaderboard (plan §15.11) — the
 * {@link EvaluationQueryService} pattern: pure query, no mutation, no events.
 *
 * HEADLESS by construction: it injects ONLY the final-result port, never the
 * game-session team port (EvaluationModule must not import game-session). So team
 * NAMES are supplied by the caller as a `teamId → name` map (the controller
 * builds it from `LobbyQueryService.listTeams`), exactly as
 * `listTeamsToEvaluate` is resolved on the game-session side. Before results are
 * calculated `final_results` is empty, so the leaderboard is `[]`.
 */
@Injectable()
export class ResultsQueryService {
  constructor(
    @Inject(EVALUATION_FINAL_RESULT_REPOSITORY_PORT)
    private readonly finalResults: FinalResultRepositoryPort,
  ) {}

  /**
   * The room's leaderboard (already `(place, teamId)`-ordered by the adapter).
   * `teamNames` resolves the display name per team id; a missing id falls back to
   * an empty string rather than throwing.
   */
  async getResults(
    roomId: string,
    teamNames: ReadonlyMap<string, string>,
  ): Promise<ResultsView> {
    const results = await this.finalResults.findByRoomId(roomId);
    return {
      leaderboard: results.map((result) =>
        toResultsEntry(result, teamNames.get(result.teamId) ?? ''),
      ),
    };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { EvaluationCriterion } from '../../domain/entities';
import {
  EVALUATION_CRITERION_REPOSITORY_PORT,
  EvaluationCriterionRepositoryPort,
  EVALUATION_SCORE_REPOSITORY_PORT,
  EvaluationScoreRepositoryPort,
} from '../../domain/ports';

/** Submitted/confirmed/expected counts for one evaluator class (no scores). */
export interface EvaluationProgressCounts {
  submitted: number;
  confirmed: number;
  expected: number;
}

/**
 * The §15.11 evaluation progress — counts ONLY, never numeric scores (the
 * §16.8 "intrigue" rule: the running tallies stay secret until results, 10.3).
 * With N teams-with-captain the expected confirmations are N(N−1) team votes
 * (each captain scores the other teams) + N host votes = N². `complete` is
 * DERIVED here but NOT acted upon — 10.2 never auto-advances to RESULTS.
 */
export interface EvaluationProgress {
  teamCount: number;
  team: EvaluationProgressCounts;
  host: EvaluationProgressCounts;
  totalExpected: number;
  complete: boolean;
}

/**
 * Stateless read model for the evaluation progress + criteria reads (plan
 * §15.11) — the {@link ShopQueryService} / {@link InventoryQueryService}
 * pattern: pure queries, no mutation, no events, no transaction of its own.
 *
 * HEADLESS by construction: it injects ONLY the two evaluation ports, never the
 * game-session team port — `EvaluationModule` cannot import `GameSessionModule`
 * (that module imports this one; the reverse would be a cycle). So
 * {@link getProgress} takes `teamCount` as an argument (resolved by the caller
 * from the room's teams) rather than reading teams itself, and the "teams to
 * evaluate" listing lives on the game-session `LobbyQueryService`.
 */
@Injectable()
export class EvaluationQueryService {
  constructor(
    @Inject(EVALUATION_SCORE_REPOSITORY_PORT)
    private readonly scores: EvaluationScoreRepositoryPort,
    @Inject(EVALUATION_CRITERION_REPOSITORY_PORT)
    private readonly criteria: EvaluationCriterionRepositoryPort,
  ) {}

  /**
   * Count the room's submitted/confirmed scores per evaluator class against the
   * N²-shaped expectation. `teamCount` is the number of teams WITH a captain
   * (passed in): a captainless team can never submit a TEAM vote, so excluding
   * it keeps the expected total honest (it would otherwise be unreachable).
   */
  async getProgress(
    roomId: string,
    teamCount: number,
  ): Promise<EvaluationProgress> {
    const scores = await this.scores.findByRoomId(roomId);
    const teamScores = scores.filter((s) => s.evaluatorType === 'TEAM');
    const hostScores = scores.filter((s) => s.evaluatorType === 'HOST');

    // N captains each score the other N−1 teams; the host scores all N teams.
    const teamExpected = teamCount * (teamCount - 1);
    const hostExpected = teamCount;

    const team: EvaluationProgressCounts = {
      submitted: teamScores.length,
      confirmed: teamScores.filter((s) => s.confirmedAt !== null).length,
      expected: teamExpected,
    };
    const host: EvaluationProgressCounts = {
      submitted: hostScores.length,
      confirmed: hostScores.filter((s) => s.confirmedAt !== null).length,
      expected: hostExpected,
    };

    return {
      teamCount,
      team,
      host,
      totalExpected: teamExpected + hostExpected,
      complete:
        team.confirmed === team.expected && host.confirmed === host.expected,
    };
  }

  /** The seeded criteria catalog, ordered by `order` ascending. */
  listCriteria(): Promise<EvaluationCriterion[]> {
    return this.criteria.listAll();
  }
}

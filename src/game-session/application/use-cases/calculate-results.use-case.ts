import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  ID_GENERATOR_PORT,
  IdGeneratorPort,
} from '../../../core/ports/id-generator.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import {
  EvaluationQueryService,
  ResultsView,
  toResultsEntry,
} from '../../../evaluation/application/queries';
import {
  EvaluationScore,
  FinalResult,
} from '../../../evaluation/domain/entities';
import { EvaluationNotCompleteError } from '../../../evaluation/domain/errors';
import {
  EVALUATION_FINAL_RESULT_REPOSITORY_PORT,
  EVALUATION_SCORE_REPOSITORY_PORT,
  EvaluationScoreRepositoryPort,
  FinalResultRepositoryPort,
} from '../../../evaluation/domain/ports';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import {
  PRESENTATION_SUBMISSION_REPOSITORY_PORT,
  PresentationSubmissionRepositoryPort,
} from '../../../presentation/domain/ports';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { Team } from '../../domain/entities';
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { GameStage, RoomStatus } from '../../domain/types';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { EvaluationEvent } from '../events';

/** Float tolerance for place comparisons — Σ(w·s)/Σw is not bit-exact (⚠️C). */
const PLACE_EPSILON = 1e-9;

export interface CalculateResultsInput {
  roomId: string;
  /** Bypass the completeness gate to finish deliberately on a partial tally. */
  force?: boolean;
}

export interface CalculateResultsResult {
  stage: GameStage;
  status: RoomStatus;
  leaderboard: ResultsView;
}

/** A team's draft result while ranking in memory, before its place is assigned. */
interface ResultDraft {
  team: Team;
  earnedScore: number;
  presentationScoreRaw: number;
  latePenalty: number;
  presentationScoreFinal: number;
  finalScore: number;
  place: number;
}

/**
 * The raw weighted-average presentation score for one target (§14.10):
 * `Σ(weight × totalScore) / Σ(weight)` over that target's CONFIRMED scores. The
 * stored `weight`/`totalScore` are summed (the {@link EvaluationScore} is the
 * authority — `totalScore` is never recomputed from topic+design here);
 * unconfirmed rows drop out, so a partial tally is tolerated. With no confirmed
 * score the denominator is 0 → the raw score is 0 (no division by zero).
 */
export function aggregateRawScore(
  scores: EvaluationScore[],
  targetTeamId: string,
): number {
  let numerator = 0;
  let denominator = 0;
  for (const score of scores) {
    if (score.targetTeamId !== targetTeamId || score.confirmedAt === null) {
      continue;
    }
    numerator += score.weight * score.totalScore;
    denominator += score.weight;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

/**
 * The host CALCULATES the final results and FINISHES the game (plan §14.10,
 * §15.11) — the LAST step of the game backbone. Legal only in EVALUATION; one
 * transaction under the per-room advisory lock (the FIRST statement). The shape
 * mirrors CloseShop/StartDefense (host + lock + transitionTo + rooms.update +
 * broadcast) but adds the aggregation, the write-once `final_results`, the game
 * finish, and emit-AFTER-commit.
 *
 * Sequence (every read + the gate run BEFORE any mutation, since
 * {@link Room.markFinished} is irreversible):
 *
 * 1. lock + 404/409-ACTIVE/409-stage gates. The stage gate doubles as
 *    IDEMPOTENCY: a second call finds the room past EVALUATION → 409.
 * 2. PARTICIPANTS = teams with a non-null `turnOrder` (the presenters — the same
 *    projection as start-defense / listTeamsToEvaluate). Teams that never
 *    presented are EXCLUDED so no phantom `final_results` row is written.
 * 3. teamCount = teams WITH a captain (a SEPARATE filter — the N for the N²
 *    completeness expectation; a captainless team never votes).
 * 4. COMPLETENESS GATE (before any mutation): if `progress.complete` is false and
 *    `force` is not true → {@link EvaluationNotCompleteError} (409). This turns a
 *    stray early POST into a recoverable 409 instead of an irreversible finish.
 * 5. Aggregate each participant's raw score, snapshot `earnedScore`/`latePenalty`
 *    under the lock, derive the final scores through the SINGLE
 *    {@link FinalResult.deriveScores} helper, rank (finalScore DESC →
 *    presentationScoreFinal DESC, epsilon-compared → teamId ASC) with DENSE
 *    places (1,1,1,2), and write each `final_results` row.
 * 6. RESULTS transition then `markFinished` (this order — if markFinished throws,
 *    the whole transaction, inserts included, rolls back), one `rooms.update`.
 *
 * Broadcasts fire AFTER the commit (captured before `return`): `completed` then
 * `results-calculated`. The finish has no corrective event, so emitting inside
 * the transaction and then failing the commit would leave clients permanently
 * believing the game ended while the GET read is empty.
 */
@Injectable()
export class CalculateResultsUseCase {
  constructor(
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(EVALUATION_SCORE_REPOSITORY_PORT)
    private readonly scores: EvaluationScoreRepositoryPort,
    @Inject(PRESENTATION_SUBMISSION_REPOSITORY_PORT)
    private readonly submissions: PresentationSubmissionRepositoryPort,
    @Inject(EVALUATION_FINAL_RESULT_REPOSITORY_PORT)
    private readonly finalResults: FinalResultRepositoryPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    private readonly evaluationQuery: EvaluationQueryService,
  ) {}

  async execute(input: CalculateResultsInput): Promise<CalculateResultsResult> {
    const committed = await this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      // Stage gate = idempotency: after the first run the room is in RESULTS, so a
      // repeat is out of stage → 409 (never a second finish).
      if (room.currentStage !== 'EVALUATION') {
        throw new UnexpectedGameStageError();
      }

      const roomTeams = await this.teams.findByRoomId(room.id);
      // ⚠️A — participants are the teams that PRESENTED (non-null turnOrder).
      const participants = roomTeams.filter((team) => team.turnOrder !== null);
      // ⚠️V2 — teamCount is a SEPARATE filter: teams WITH a captain (the voters).
      const teamCount = roomTeams.filter(
        (team) => team.captainPlayerId !== null,
      ).length;

      const scores = await this.scores.findByRoomId(room.id);
      const submissions = await this.submissions.findByRoomId(room.id);
      const submissionByTeam = new Map(
        submissions.map((submission) => [submission.teamId, submission]),
      );

      // ⚠️B — completeness gate BEFORE any mutation (the finish is irreversible).
      const progress = await this.evaluationQuery.getProgress(
        room.id,
        teamCount,
      );
      if (!progress.complete && input.force !== true) {
        throw new EvaluationNotCompleteError();
      }

      // Draft each participant's scores in memory through the SINGLE derive
      // helper, snapshotting earnedScore (Score VO) + latePenalty under the lock.
      const drafts: ResultDraft[] = participants.map((team) => {
        const presentationScoreRaw = aggregateRawScore(scores, team.id);
        const earnedScore = team.earnedScore.value;
        const latePenalty = submissionByTeam.get(team.id)?.latePenalty ?? 0;
        const { presentationScoreFinal, finalScore } = FinalResult.deriveScores(
          presentationScoreRaw,
          latePenalty,
          earnedScore,
        );
        return {
          team,
          earnedScore,
          presentationScoreRaw,
          latePenalty,
          presentationScoreFinal,
          finalScore,
          place: 0,
        };
      });

      // Rank: finalScore DESC → presentationScoreFinal DESC (epsilon) → teamId ASC.
      drafts.sort((a, b) => {
        if (Math.abs(a.finalScore - b.finalScore) >= PLACE_EPSILON) {
          return b.finalScore - a.finalScore;
        }
        if (
          Math.abs(a.presentationScoreFinal - b.presentationScoreFinal) >=
          PLACE_EPSILON
        ) {
          return b.presentationScoreFinal - a.presentationScoreFinal;
        }
        return a.team.id < b.team.id ? -1 : a.team.id > b.team.id ? 1 : 0;
      });

      // DENSE places (1,1,1,2): a tie shares a place, the next is the next int.
      let place = 0;
      for (let i = 0; i < drafts.length; i += 1) {
        const tiedWithPrevious =
          i > 0 &&
          Math.abs(drafts[i].finalScore - drafts[i - 1].finalScore) <
            PLACE_EPSILON &&
          Math.abs(
            drafts[i].presentationScoreFinal -
              drafts[i - 1].presentationScoreFinal,
          ) < PLACE_EPSILON;
        if (!tiedWithPrevious) {
          place += 1;
        }
        drafts[i].place = place;
      }

      const now = this.clock.now();
      const nameByTeam = new Map(
        roomTeams.map((team) => [team.id, team.name.value]),
      );
      const created: FinalResult[] = [];
      for (const draft of drafts) {
        const result = FinalResult.create(
          {
            id: this.ids.generate(),
            roomId: room.id,
            teamId: draft.team.id,
            earnedScore: draft.earnedScore,
            presentationScoreRaw: draft.presentationScoreRaw,
            latePenalty: draft.latePenalty,
            place: draft.place,
          },
          now,
        );
        await this.finalResults.create(result);
        created.push(result);
      }

      // ⚠️J — RESULTS first (validates the new edge), THEN finish (asserts ACTIVE).
      // markFinished throwing rolls back the inserts + the stage move.
      room.transitionTo('RESULTS');
      room.markFinished(now);
      await this.rooms.update(room);

      // The leaderboard is already (place, teamId)-ordered (the sort above), so
      // it matches the adapter's orderBy on the GET path. Captured for the
      // after-commit broadcast (⚠️D).
      const leaderboard: ResultsView = {
        leaderboard: created.map((result) =>
          toResultsEntry(result, nameByTeam.get(result.teamId) ?? ''),
        ),
      };

      return { stage: room.currentStage, status: room.status, leaderboard };
    });

    // AFTER commit (⚠️D): the irreversible finish has no corrective event.
    this.realtime.emitToRoom(input.roomId, EvaluationEvent.Completed, {
      roomId: input.roomId,
      stage: committed.stage,
      status: committed.status,
    });
    this.realtime.emitToRoom(input.roomId, EvaluationEvent.ResultsCalculated, {
      roomId: input.roomId,
      leaderboard: committed.leaderboard.leaderboard,
    });

    return committed;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import {
  EvaluationProgress,
  EvaluationQueryService,
} from '../../../evaluation/application/queries';
import { EvaluationScore } from '../../../evaluation/domain/entities';
import {
  EvaluationAlreadyConfirmedError,
  EvaluationNotFoundError,
} from '../../../evaluation/domain/errors';
import {
  EVALUATION_SCORE_REPOSITORY_PORT,
  EvaluationScoreRepositoryPort,
} from '../../../evaluation/domain/ports';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import {
  NotTeamCaptainError,
  RoomNotActiveError,
  RoomNotFoundError,
} from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { EvaluationEvent } from '../events';
import { TRANSACTION_PORT, TransactionPort } from '../ports';

/** The acting evaluator — a team captain (by player id) or the host. */
export type ConfirmEvaluationEvaluator =
  | { type: 'TEAM'; actingPlayerId: string }
  | { type: 'HOST' };

export interface ConfirmEvaluationInput {
  roomId: string;
  evaluator: ConfirmEvaluationEvaluator;
  /** Per-target (strict) when set; all-at-once (freezes the remainder) when omitted. */
  targetTeamId?: string;
}

/** The scores frozen by this call (possibly empty) and the progress counts. */
export interface ConfirmEvaluationResult {
  confirmed: EvaluationScore[];
  progress: EvaluationProgress;
}

/**
 * A team captain or the host CONFIRMS their evaluation scores (plan §14.10,
 * §15.11) — confirmation is immutable (Variant A: {@link EvaluationScore.confirm}
 * returns a frozen instance). Legal only in EVALUATION. Two granularities, both
 * under the per-room advisory lock (the FIRST statement):
 *
 * - **per-target** (`targetTeamId` set) — STRICT: no draft for that
 *   (target, evaluator) is {@link EvaluationNotFoundError} (404); an already
 *   confirmed one is {@link EvaluationAlreadyConfirmedError} (409).
 * - **all-at-once** (`targetTeamId` omitted) — FILTERS to this evaluator's
 *   UNCONFIRMED rows and freezes only those. A previously per-target-confirmed
 *   row is simply skipped (never re-confirmed → never throws), so a partial
 *   per-target pass followed by an all-at-once finish CANNOT deadlock; an
 *   all-at-once with nothing left to freeze is idempotent (returns `[]`).
 *
 * Broadcasts (room-wide, in the transaction): one `score-confirmed` per frozen
 * score, then a single `progress-updated` — emitted only when something was
 * actually confirmed. NEITHER carries a numeric score (§16.8 secrecy).
 * Aggregation/places stay in Stage 10.3; this never advances the stage.
 */
@Injectable()
export class ConfirmEvaluationUseCase {
  constructor(
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(EVALUATION_SCORE_REPOSITORY_PORT)
    private readonly scores: EvaluationScoreRepositoryPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    private readonly evaluationQuery: EvaluationQueryService,
  ) {}

  async execute(
    input: ConfirmEvaluationInput,
  ): Promise<ConfirmEvaluationResult> {
    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      if (room.currentStage !== 'EVALUATION') {
        throw new UnexpectedGameStageError();
      }

      // Resolve the evaluator (never from the body) — the submit-use-case rule.
      let evaluatorTeamId: string | null;
      if (input.evaluator.type === 'TEAM') {
        const player = await this.players.findById(
          input.evaluator.actingPlayerId,
        );
        if (!player || !player.teamId) {
          throw new NotTeamCaptainError();
        }
        const evaluatorTeam = await this.teams.findById(player.teamId);
        if (
          !evaluatorTeam ||
          evaluatorTeam.captainPlayerId !== input.evaluator.actingPlayerId ||
          evaluatorTeam.roomId !== room.id
        ) {
          throw new NotTeamCaptainError();
        }
        evaluatorTeamId = evaluatorTeam.id;
      } else {
        evaluatorTeamId = null;
      }

      const now = this.clock.now();
      const confirmed: EvaluationScore[] = [];

      if (input.targetTeamId !== undefined) {
        // Per-target — strict.
        const existing = await this.scores.findByRoomTargetEvaluator(
          room.id,
          input.targetTeamId,
          input.evaluator.type,
          evaluatorTeamId,
        );
        if (!existing) {
          throw new EvaluationNotFoundError();
        }
        if (existing.confirmedAt !== null) {
          throw new EvaluationAlreadyConfirmedError();
        }
        const frozen = existing.confirm(now);
        await this.scores.update(frozen);
        confirmed.push(frozen);
      } else {
        // All-at-once — freeze ONLY this evaluator's still-unconfirmed rows.
        const all = await this.scores.findByRoomId(room.id);
        const mine = all.filter(
          (score) =>
            score.confirmedAt === null &&
            (input.evaluator.type === 'HOST'
              ? score.evaluatorType === 'HOST'
              : score.evaluatorType === 'TEAM' &&
                score.evaluatorTeamId === evaluatorTeamId),
        );
        for (const score of mine) {
          const frozen = score.confirm(now);
          await this.scores.update(frozen);
          confirmed.push(frozen);
        }
      }

      // teamCount = teams WITH a captain (a captainless team never votes).
      const roomTeams = await this.teams.findByRoomId(room.id);
      const teamCount = roomTeams.filter(
        (team) => team.captainPlayerId !== null,
      ).length;
      const progress = await this.evaluationQuery.getProgress(
        room.id,
        teamCount,
      );

      // Room-wide, NO numeric scores (§16.8 secrecy). Progress only on a change.
      for (const score of confirmed) {
        this.realtime.emitToRoom(room.id, EvaluationEvent.ScoreConfirmed, {
          roomId: room.id,
          targetTeamId: score.targetTeamId,
          evaluatorType: score.evaluatorType,
          evaluatorTeamId: score.evaluatorTeamId,
        });
      }
      if (confirmed.length > 0) {
        this.realtime.emitToRoom(room.id, EvaluationEvent.ProgressUpdated, {
          roomId: room.id,
          team: progress.team,
          host: progress.host,
          totalExpected: progress.totalExpected,
          complete: progress.complete,
        });
      }

      return { confirmed, progress };
    });
  }
}

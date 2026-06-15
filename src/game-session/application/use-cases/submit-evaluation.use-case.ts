import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR_PORT,
  IdGeneratorPort,
} from '../../../core/ports/id-generator.port';
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
  ScoreOutOfRangeError,
  SelfEvaluationError,
  TargetTeamNotFoundError,
} from '../../../evaluation/domain/errors';
import {
  EVALUATION_CRITERION_REPOSITORY_PORT,
  EvaluationCriterionRepositoryPort,
  EVALUATION_SCORE_REPOSITORY_PORT,
  EvaluationScoreRepositoryPort,
} from '../../../evaluation/domain/ports';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { EVALUATION_CRITERIA_COUNT } from '../../../infrastructure/database/seeds/seed-data.schema';
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
export type SubmitEvaluationEvaluator =
  | { type: 'TEAM'; actingPlayerId: string }
  | { type: 'HOST' };

export interface SubmitEvaluationInput {
  roomId: string;
  targetTeamId: string;
  topicScore: number;
  designScore: number;
  /** Discriminated — `evaluatorTeamId` is NEVER taken from the body. */
  evaluator: SubmitEvaluationEvaluator;
}

/** The recorded score, whether it was a fresh create, and the progress counts. */
export interface SubmitEvaluationResult {
  score: EvaluationScore;
  created: boolean;
  progress: EvaluationProgress;
}

/**
 * A team captain or the host scores ONE team (plan §14.10, §15.11) — the
 * collection half of Stage 10. Legal only in EVALUATION (the room is parked
 * there after the last defense finishes, 10.1). Aggregation
 * (presentationScoreRaw / finalScore / places) is Stage 10.3 — this only
 * records `EvaluationScore` rows.
 *
 * The evaluator is NEVER trusted from the request body: a TEAM vote's
 * `evaluatorTeamId` is derived from the acting player's own team (captain-authz,
 * the {@link PurchaseItemUseCase} precedent), a HOST vote's `hostId` from
 * `room.hostId`. A team can never score itself — rejected with
 * {@link SelfEvaluationError} BEFORE any persistence (the load-bearing guard);
 * {@link EvaluationScore.create} backstops the same shape ({@link
 * InvalidEvaluatorError}), since there is no DB constraint against self-eval.
 *
 * Create-or-update under the per-room advisory lock (the lock is the FIRST
 * statement, serialising every same-room race): an existing UNCONFIRMED score
 * is overwritten (re-evaluation), an existing CONFIRMED one is frozen
 * ({@link EvaluationAlreadyConfirmedError}), otherwise a fresh row is inserted.
 * The insert's unique-index 23505 is a defensive net only — translated to
 * {@link EvaluationAlreadySubmittedError} by the adapter.
 *
 * Broadcasts (room-wide, inside the transaction): `score-submitted` then
 * `progress-updated`, NEITHER carrying any numeric score (§16.8 secrecy — the
 * tallies stay counts-only until results). The author's own numbers come back
 * only in the REST reply ({@link SubmitEvaluationResult.score}).
 */
@Injectable()
export class SubmitEvaluationUseCase {
  constructor(
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(EVALUATION_SCORE_REPOSITORY_PORT)
    private readonly scores: EvaluationScoreRepositoryPort,
    @Inject(EVALUATION_CRITERION_REPOSITORY_PORT)
    private readonly criteria: EvaluationCriterionRepositoryPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    private readonly evaluationQuery: EvaluationQueryService,
  ) {}

  async execute(input: SubmitEvaluationInput): Promise<SubmitEvaluationResult> {
    // The criteria catalog is a global immutable seed — read it BEFORE the lock
    // to keep the critical section short (no evaluation-score read precedes it).
    const allCriteria = await this.criteria.listAll();

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

      // Resolve the evaluator (never from the body). TEAM: captain-authz on the
      // actor's OWN team + the symmetric cross-tenant guard; HOST: room.hostId.
      let evaluatorTeamId: string | null;
      let hostId: string | null;
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
          evaluatorTeam.captainPlayerId !== input.evaluator.actingPlayerId
        ) {
          throw new NotTeamCaptainError();
        }
        // Symmetric with the target check: a captain from ANOTHER room cannot
        // write a score into this room.
        if (evaluatorTeam.roomId !== room.id) {
          throw new NotTeamCaptainError();
        }
        evaluatorTeamId = evaluatorTeam.id;
        hostId = null;
      } else {
        evaluatorTeamId = null;
        hostId = room.hostId;
      }

      // The target must exist AND belong to this room (cross-tenant guard).
      const targetTeam = await this.teams.findById(input.targetTeamId);
      if (!targetTeam || targetTeam.roomId !== room.id) {
        throw new TargetTeamNotFoundError();
      }

      // Self-evaluation ban — BEFORE any persistence (§14.10). Only a TEAM can
      // self-target; a HOST has a null evaluatorTeamId.
      if (
        input.evaluator.type === 'TEAM' &&
        evaluatorTeamId === input.targetTeamId
      ) {
        throw new SelfEvaluationError();
      }

      // Range from the seeded criteria BY ORDER, never by the localized title:
      // order 0 IS "Раскрытие темы" → topicScore; order 1 IS "Дизайн
      // презентации" → designScore (must match evaluation-criteria.json). The
      // count assert pins the positional mapping.
      if (allCriteria.length !== EVALUATION_CRITERIA_COUNT) {
        throw new Error(
          `Expected exactly ${EVALUATION_CRITERIA_COUNT} evaluation criteria; the seed catalog is misconfigured.`,
        );
      }
      const [topicCriterion, designCriterion] = allCriteria;
      if (
        input.topicScore < topicCriterion.minScore ||
        input.topicScore > topicCriterion.maxScore ||
        input.designScore < designCriterion.minScore ||
        input.designScore > designCriterion.maxScore
      ) {
        throw new ScoreOutOfRangeError();
      }

      // Create-or-update under the lock. A confirmed row is frozen; an
      // unconfirmed one is overwritten; otherwise a fresh row is inserted.
      const existing = await this.scores.findByRoomTargetEvaluator(
        room.id,
        input.targetTeamId,
        input.evaluator.type,
        evaluatorTeamId,
      );
      let created: boolean;
      const score = EvaluationScore.create({
        id: existing ? existing.id : this.ids.generate(),
        roomId: room.id,
        targetTeamId: input.targetTeamId,
        evaluatorType: input.evaluator.type,
        evaluatorTeamId,
        hostId,
        topicScore: input.topicScore,
        designScore: input.designScore,
      });
      if (existing) {
        if (existing.confirmedAt !== null) {
          throw new EvaluationAlreadyConfirmedError();
        }
        await this.scores.update(score);
        created = false;
      } else {
        await this.scores.create(score); // 23505 defensive net under the lock
        created = true;
      }

      // teamCount = teams WITH a captain (a captainless team never votes, so it
      // must not inflate the expected total).
      const roomTeams = await this.teams.findByRoomId(room.id);
      const teamCount = roomTeams.filter(
        (team) => team.captainPlayerId !== null,
      ).length;
      const progress = await this.evaluationQuery.getProgress(
        room.id,
        teamCount,
      );

      // Room-wide, NO numeric scores (§16.8 secrecy).
      this.realtime.emitToRoom(room.id, EvaluationEvent.ScoreSubmitted, {
        roomId: room.id,
        targetTeamId: input.targetTeamId,
        evaluatorType: input.evaluator.type,
        evaluatorTeamId,
        created,
      });
      this.realtime.emitToRoom(room.id, EvaluationEvent.ProgressUpdated, {
        roomId: room.id,
        team: progress.team,
        host: progress.host,
        totalExpected: progress.totalExpected,
        complete: progress.complete,
      });

      return { score, created, progress };
    });
  }
}

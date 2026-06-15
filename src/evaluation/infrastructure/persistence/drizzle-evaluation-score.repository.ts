import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { evaluationScores } from '../../../infrastructure/database/schema';
import { EvaluationScore } from '../../domain/entities';
import { EvaluationScoreRepositoryPort } from '../../domain/ports';
import { EvaluatorType } from '../../domain/types';
import {
  mapEvaluationScoreToInsert,
  mapEvaluationScoreToUpdate,
  mapRowToEvaluationScore,
} from './mappers';
import { translateEvaluationUniqueViolation } from './pg-error.util';

/**
 * Drizzle/PostgreSQL adapter for {@link EvaluationScoreRepositoryPort}.
 * Transaction-aware via the shared {@link TransactionContext}. `create`
 * translates a unique-index 23505 (the defensive net under the per-room lock)
 * into {@link EvaluationAlreadySubmittedError}; `update` (keyed on the row `id`)
 * carries both a re-evaluation and a confirm and never touches the unique
 * columns, so it needs no translation.
 */
@Injectable()
export class DrizzleEvaluationScoreRepository implements EvaluationScoreRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async create(score: EvaluationScore): Promise<void> {
    try {
      await this.executor()
        .insert(evaluationScores)
        .values(mapEvaluationScoreToInsert(score));
    } catch (error) {
      translateEvaluationUniqueViolation(error);
    }
  }

  async update(score: EvaluationScore): Promise<void> {
    await this.executor()
      .update(evaluationScores)
      .set(mapEvaluationScoreToUpdate(score))
      .where(eq(evaluationScores.id, score.id));
  }

  /**
   * The at-most-one score for an evaluator. For a HOST the match MUST be
   * `isNull(evaluator_team_id)` (a SQL `evaluator_team_id = NULL` is never true,
   * so an eq-on-null would miss the host's own draft and force a false 23505 on
   * re-evaluation); for a TEAM it is `eq(evaluator_team_id, ...)`. Both branches
   * also pin `evaluator_type` so the two evaluator classes never cross.
   */
  async findByRoomTargetEvaluator(
    roomId: string,
    targetTeamId: string,
    evaluatorType: EvaluatorType,
    evaluatorTeamId: string | null,
  ): Promise<EvaluationScore | null> {
    const evaluatorMatch =
      evaluatorType === 'HOST'
        ? isNull(evaluationScores.evaluatorTeamId)
        : eq(evaluationScores.evaluatorTeamId, evaluatorTeamId ?? '');
    const [row] = await this.executor()
      .select()
      .from(evaluationScores)
      .where(
        and(
          eq(evaluationScores.roomId, roomId),
          eq(evaluationScores.targetTeamId, targetTeamId),
          eq(evaluationScores.evaluatorType, evaluatorType),
          evaluatorMatch,
        ),
      )
      .limit(1);
    return row ? mapRowToEvaluationScore(row) : null;
  }

  async findByRoomId(roomId: string): Promise<EvaluationScore[]> {
    const rows = await this.executor()
      .select()
      .from(evaluationScores)
      .where(eq(evaluationScores.roomId, roomId));
    return rows.map(mapRowToEvaluationScore);
  }
}

import { Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { evaluationCriteria } from '../../../infrastructure/database/schema';
import { EvaluationCriterion } from '../../domain/entities';
import { EvaluationCriterionRepositoryPort } from '../../domain/ports';
import { mapRowToEvaluationCriterion } from './mappers';

/**
 * Drizzle/PostgreSQL adapter for {@link EvaluationCriterionRepositoryPort}. A
 * read-only seed catalog: `listAll` returns the criteria ordered by `order`
 * ascending so the submit use case can map `order 0 → topicScore`,
 * `order 1 → designScore` positionally. Transaction-agnostic (the executor
 * resolves the ambient transaction when one is active).
 */
@Injectable()
export class DrizzleEvaluationCriterionRepository implements EvaluationCriterionRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async listAll(): Promise<EvaluationCriterion[]> {
    const rows = await this.executor()
      .select()
      .from(evaluationCriteria)
      .orderBy(asc(evaluationCriteria.order));
    return rows.map(mapRowToEvaluationCriterion);
  }
}

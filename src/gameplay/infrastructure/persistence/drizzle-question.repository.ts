import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { questions } from '../../../infrastructure/database/schema';
import { Question } from '../../domain/entities';
import { QuestionRepositoryPort } from '../../domain/ports';
import { mapRowToQuestion } from './mappers';

/** Drizzle/PostgreSQL adapter for {@link QuestionRepositoryPort} (read-only). */
@Injectable()
export class DrizzleQuestionRepository implements QuestionRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async listAll(): Promise<Question[]> {
    const rows = await this.executor().select().from(questions);
    return rows.map(mapRowToQuestion);
  }

  async findById(id: string): Promise<Question | null> {
    const [row] = await this.executor()
      .select()
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);
    return row ? mapRowToQuestion(row) : null;
  }

  async listByCategoryId(categoryId: string): Promise<Question[]> {
    const rows = await this.executor()
      .select()
      .from(questions)
      .where(eq(questions.categoryId, categoryId));
    return rows.map(mapRowToQuestion);
  }
}

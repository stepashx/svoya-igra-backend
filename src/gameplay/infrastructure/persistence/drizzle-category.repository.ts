import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { categories } from '../../../infrastructure/database/schema';
import { Category } from '../../domain/entities';
import { CategoryRepositoryPort } from '../../domain/ports';
import { mapRowToCategory } from './mappers';

/** Drizzle/PostgreSQL adapter for {@link CategoryRepositoryPort} (read-only). */
@Injectable()
export class DrizzleCategoryRepository implements CategoryRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async listAll(): Promise<Category[]> {
    const rows = await this.executor().select().from(categories);
    return rows.map(mapRowToCategory);
  }

  async findById(id: string): Promise<Category | null> {
    const [row] = await this.executor()
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    return row ? mapRowToCategory(row) : null;
  }
}

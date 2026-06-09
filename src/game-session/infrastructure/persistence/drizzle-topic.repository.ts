import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { presentationTopics } from '../../../infrastructure/database/schema';
import { Topic } from '../../domain/entities';
import { TopicRepositoryPort } from '../../domain/ports';
import { mapRowToTopic } from './mappers';

/** Drizzle/PostgreSQL adapter for {@link TopicRepositoryPort} (read-only). */
@Injectable()
export class DrizzleTopicRepository implements TopicRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async findAll(): Promise<Topic[]> {
    const rows = await this.executor().select().from(presentationTopics);
    return rows.map(mapRowToTopic);
  }

  async findById(id: string): Promise<Topic | null> {
    const [row] = await this.executor()
      .select()
      .from(presentationTopics)
      .where(eq(presentationTopics.id, id))
      .limit(1);
    return row ? mapRowToTopic(row) : null;
  }
}

import { Injectable } from '@nestjs/common';
import { asc } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { presentationRequirements } from '../../../infrastructure/database/schema';
import { PresentationRequirement } from '../../domain/entities';
import { PresentationRequirementRepositoryPort } from '../../domain/ports';
import { mapRowToPresentationRequirement } from './mappers';

/**
 * Drizzle/PostgreSQL adapter for {@link PresentationRequirementRepositoryPort}
 * (read-only). Lists the seeded catalog in `order` (display sequence).
 */
@Injectable()
export class DrizzlePresentationRequirementRepository implements PresentationRequirementRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async listAll(): Promise<PresentationRequirement[]> {
    const rows = await this.executor()
      .select()
      .from(presentationRequirements)
      .orderBy(asc(presentationRequirements.order));
    return rows.map(mapRowToPresentationRequirement);
  }
}

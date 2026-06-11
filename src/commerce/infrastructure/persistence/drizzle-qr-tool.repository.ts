import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { qrTools } from '../../../infrastructure/database/schema';
import { QrTool } from '../../domain/entities';
import { QrToolRepositoryPort } from '../../domain/ports';
import { mapRowToQrTool } from './mappers';

/** Drizzle/PostgreSQL adapter for {@link QrToolRepositoryPort} (read-only). */
@Injectable()
export class DrizzleQrToolRepository implements QrToolRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async findById(id: string): Promise<QrTool | null> {
    const [row] = await this.executor()
      .select()
      .from(qrTools)
      .where(eq(qrTools.id, id))
      .limit(1);
    return row ? mapRowToQrTool(row) : null;
  }

  /** Batch lookup for an inventory view. A no-op for an empty id list. */
  async listByIds(ids: string[]): Promise<QrTool[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.executor()
      .select()
      .from(qrTools)
      .where(inArray(qrTools.id, ids));
    return rows.map(mapRowToQrTool);
  }
}

import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { finalResults } from '../../../infrastructure/database/schema';
import { FinalResult } from '../../domain/entities';
import { FinalResultRepositoryPort } from '../../domain/ports';
import { mapFinalResultToInsert, mapRowToFinalResult } from './mappers';
import { translateFinalResultUniqueViolation } from './pg-error.util';

/**
 * Drizzle/PostgreSQL adapter for {@link FinalResultRepositoryPort}.
 * Transaction-aware via the shared {@link TransactionContext} — CalculateResults
 * inserts every team's result inside one transaction under the per-room lock.
 * `create` is a plain insert (NEVER an upsert — results are write-once); its
 * unique-index 23505 is translated to {@link ResultsAlreadyCalculatedError} as
 * the defensive backstop behind the stage gate. `findByRoomId` orders
 * `(place, teamId)` so a results read is deterministic regardless of the
 * insertion order (the §14.10 reconnect read).
 */
@Injectable()
export class DrizzleFinalResultRepository implements FinalResultRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async create(result: FinalResult): Promise<void> {
    try {
      await this.executor()
        .insert(finalResults)
        .values(mapFinalResultToInsert(result));
    } catch (error) {
      translateFinalResultUniqueViolation(error);
    }
  }

  async findByRoomId(roomId: string): Promise<FinalResult[]> {
    const rows = await this.executor()
      .select()
      .from(finalResults)
      .where(eq(finalResults.roomId, roomId))
      .orderBy(asc(finalResults.place), asc(finalResults.teamId));
    return rows.map(mapRowToFinalResult);
  }
}

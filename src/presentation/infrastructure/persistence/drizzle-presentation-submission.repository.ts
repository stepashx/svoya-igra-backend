import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { presentationSubmissions } from '../../../infrastructure/database/schema';
import { PresentationSubmission } from '../../domain/entities';
import { PresentationSubmissionRepositoryPort } from '../../domain/ports';
import {
  mapPresentationSubmissionToInsert,
  mapRowToPresentationSubmission,
} from './mappers';

/**
 * Drizzle/PostgreSQL adapter for {@link PresentationSubmissionRepositoryPort}.
 * Transaction-aware via the shared {@link TransactionContext}. `create` is a
 * plain insert — the `presentation_submissions_room_id_team_id_uq` 23505 is
 * unreachable in 9.1 (no upload use case calls it yet); the replace/upsert path
 * and its constraint translation land with the upload use case (9.3).
 */
@Injectable()
export class DrizzlePresentationSubmissionRepository implements PresentationSubmissionRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async create(submission: PresentationSubmission): Promise<void> {
    await this.executor()
      .insert(presentationSubmissions)
      .values(mapPresentationSubmissionToInsert(submission));
  }

  async findByRoomAndTeam(
    roomId: string,
    teamId: string,
  ): Promise<PresentationSubmission | null> {
    const [row] = await this.executor()
      .select()
      .from(presentationSubmissions)
      .where(
        and(
          eq(presentationSubmissions.roomId, roomId),
          eq(presentationSubmissions.teamId, teamId),
        ),
      )
      .limit(1);
    return row ? mapRowToPresentationSubmission(row) : null;
  }

  async findByRoomId(roomId: string): Promise<PresentationSubmission[]> {
    const rows = await this.executor()
      .select()
      .from(presentationSubmissions)
      .where(eq(presentationSubmissions.roomId, roomId));
    return rows.map(mapRowToPresentationSubmission);
  }
}

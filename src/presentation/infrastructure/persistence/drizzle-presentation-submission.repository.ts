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
  mapPresentationSubmissionToUpdate,
  mapRowToPresentationSubmission,
} from './mappers';
import { translatePresentationUniqueViolation } from './pg-error.util';

/**
 * Drizzle/PostgreSQL adapter for {@link PresentationSubmissionRepositoryPort}.
 * Transaction-aware via the shared {@link TransactionContext}. `create`
 * translates the `presentation_submissions_room_id_team_id_uq` 23505 into
 * {@link PresentationSubmissionConflictError} — defensive, since the upload use
 * case resolves create-vs-replace under the per-room advisory lock, so a
 * concurrent insert is unreachable in practice. `replace` is the re-upload
 * UPDATE keyed on that same (room, team) unique index.
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
    try {
      await this.executor()
        .insert(presentationSubmissions)
        .values(mapPresentationSubmissionToInsert(submission));
    } catch (error) {
      translatePresentationUniqueViolation(error);
    }
  }

  async replace(submission: PresentationSubmission): Promise<void> {
    await this.executor()
      .update(presentationSubmissions)
      .set(mapPresentationSubmissionToUpdate(submission))
      .where(
        and(
          eq(presentationSubmissions.roomId, submission.roomId),
          eq(presentationSubmissions.teamId, submission.teamId),
        ),
      );
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

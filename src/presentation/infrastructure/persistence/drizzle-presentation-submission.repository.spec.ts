import { DatabaseService } from '../../../infrastructure/database/database.service';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { PresentationSubmission } from '../../domain/entities';
import { PresentationSubmissionConflictError } from '../../domain/errors';
import { DrizzlePresentationSubmissionRepository } from './drizzle-presentation-submission.repository';
import {
  mapPresentationSubmissionToInsert,
  mapPresentationSubmissionToUpdate,
} from './mappers';

/**
 * Focused on the cross-cutting behaviour: executor selection (ambient tx vs.
 * pooled client), the query/insert/update shapes, and (9.3) the 23505 →
 * {@link PresentationSubmissionConflictError} translation on `create` and the
 * `replace` UPDATE keyed on (room, team). The mapping itself is covered by the
 * mapper spec.
 */
describe('DrizzlePresentationSubmissionRepository (tx-awareness)', () => {
  const uploadedAt = new Date('2026-06-14T12:09:00.000Z');
  const deadlineAt = new Date('2026-06-14T12:10:00.000Z');

  const submission = PresentationSubmission.reconstitute({
    id: 'sub-1',
    roomId: 'room-1',
    teamId: 'team-1',
    uploadedByPlayerId: 'player-1',
    originalFileName: 'deck.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    storageProvider: 'minio',
    bucket: 'svoya-igra',
    storageKey: 'rooms/room-1/presentations/team-1/sub-1.pdf',
    publicUrl:
      'http://localhost:9000/svoya-igra/rooms/room-1/presentations/team-1/sub-1.pdf',
    uploadedAt,
    deadlineAt,
    isLate: false,
    latePenalty: 0,
    status: 'UPLOADED',
  });

  const row = {
    id: 'sub-1',
    roomId: 'room-1',
    teamId: 'team-1',
    uploadedByPlayerId: 'player-1',
    originalFileName: 'deck.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    storageProvider: 'minio',
    bucket: 'svoya-igra',
    storageKey: 'rooms/room-1/presentations/team-1/sub-1.pdf',
    publicUrl:
      'http://localhost:9000/svoya-igra/rooms/room-1/presentations/team-1/sub-1.pdf',
    uploadedAt,
    deadlineAt,
    isLate: false,
    latePenalty: 0,
    status: 'UPLOADED' as const,
  };

  /**
   * A fake executor: `insert(...).values(...)` resolves, `select(...)` resolves
   * rows, and `update(...).set(...).where(...)` resolves (the replace path).
   */
  const makeExecutor = (rows: unknown[] = []) => {
    const values = jest.fn(() => Promise.resolve());
    const insert = jest.fn(() => ({ values }));
    const limit = jest.fn(() => Promise.resolve(rows));
    const where = jest.fn(() =>
      Object.assign(Promise.resolve(rows), { limit }),
    );
    const from = jest.fn(() => ({ where }));
    const select = jest.fn(() => ({ from }));
    const updateWhere = jest.fn(() => Promise.resolve());
    const set = jest.fn(() => ({ where: updateWhere }));
    const update = jest.fn(() => ({ set }));
    return {
      insert,
      values,
      select,
      from,
      where,
      limit,
      update,
      set,
      updateWhere,
    };
  };

  const makeRepo = (
    db: ReturnType<typeof makeExecutor>,
    tx?: ReturnType<typeof makeExecutor>,
  ) =>
    new DrizzlePresentationSubmissionRepository(
      { db } as unknown as DatabaseService,
      { current: tx } as unknown as TransactionContext,
    );

  it('runs writes on the pooled client when no transaction is ambient', async () => {
    const db = makeExecutor();
    await makeRepo(db).create(submission);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledTimes(1);
    expect(db.values).toHaveBeenCalledWith(
      mapPresentationSubmissionToInsert(submission),
    );
  });

  it('runs writes on the ambient transaction when one is active', async () => {
    const db = makeExecutor();
    const tx = makeExecutor();
    await makeRepo(db, tx).create(submission);
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('findByRoomAndTeam returns the mapped entity when a row is present', async () => {
    const found = await makeRepo(makeExecutor([row])).findByRoomAndTeam(
      'room-1',
      'team-1',
    );
    expect(found?.id).toBe('sub-1');
    expect(found?.teamId).toBe('team-1');
  });

  it('findByRoomAndTeam returns null when no row matches', async () => {
    const found = await makeRepo(makeExecutor([])).findByRoomAndTeam(
      'room-1',
      'team-1',
    );
    expect(found).toBeNull();
  });

  it('findByRoomId maps every row', async () => {
    const found = await makeRepo(makeExecutor([row])).findByRoomId('room-1');
    expect(found).toHaveLength(1);
    expect(found[0].storageKey).toBe(row.storageKey);
  });

  it('replace UPDATEs with the partial payload (keyed on room/team)', async () => {
    const db = makeExecutor();
    await makeRepo(db).replace(submission);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.set).toHaveBeenCalledWith(
      mapPresentationSubmissionToUpdate(submission),
    );
    expect(db.updateWhere).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('replace runs on the ambient transaction when one is active', async () => {
    const db = makeExecutor();
    const tx = makeExecutor();
    await makeRepo(db, tx).replace(submission);
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('translates a 23505 on create into PresentationSubmissionConflictError', async () => {
    const db = makeExecutor();
    db.values.mockRejectedValueOnce({
      code: '23505',
      constraint: 'presentation_submissions_room_id_team_id_uq',
    });
    await expect(makeRepo(db).create(submission)).rejects.toBeInstanceOf(
      PresentationSubmissionConflictError,
    );
  });

  it('re-throws a non-unique create error unchanged (→ 500)', async () => {
    const db = makeExecutor();
    const boom = new Error('connection reset');
    db.values.mockRejectedValueOnce(boom);
    await expect(makeRepo(db).create(submission)).rejects.toBe(boom);
  });
});

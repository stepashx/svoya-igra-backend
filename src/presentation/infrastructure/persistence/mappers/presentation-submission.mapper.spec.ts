import { presentationSubmissions } from '../../../../infrastructure/database/schema';
import { PresentationSubmission } from '../../../domain/entities';
import {
  mapPresentationSubmissionToInsert,
  mapRowToPresentationSubmission,
} from './presentation-submission.mapper';

describe('presentation-submission.mapper', () => {
  const uploadedAt = new Date('2026-06-14T12:09:00.000Z');
  const deadlineAt = new Date('2026-06-14T12:10:00.000Z');

  const row: typeof presentationSubmissions.$inferSelect = {
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
  };

  it('maps a row to a submission entity (all 16 fields)', () => {
    const submission = mapRowToPresentationSubmission(row);
    expect(submission.id).toBe('sub-1');
    expect(submission.roomId).toBe('room-1');
    expect(submission.teamId).toBe('team-1');
    expect(submission.uploadedByPlayerId).toBe('player-1');
    expect(submission.originalFileName).toBe('deck.pdf');
    expect(submission.mimeType).toBe('application/pdf');
    expect(submission.fileSize).toBe(2048);
    expect(submission.storageProvider).toBe('minio');
    expect(submission.bucket).toBe('svoya-igra');
    expect(submission.storageKey).toBe(row.storageKey);
    expect(submission.publicUrl).toBe(row.publicUrl);
    expect(submission.uploadedAt).toBe(uploadedAt);
    expect(submission.deadlineAt).toBe(deadlineAt);
    expect(submission.isLate).toBe(false);
    expect(submission.latePenalty).toBe(0);
    expect(submission.status).toBe('UPLOADED');
  });

  it('carries a null uploadedByPlayerId through', () => {
    expect(
      mapRowToPresentationSubmission({ ...row, uploadedByPlayerId: null })
        .uploadedByPlayerId,
    ).toBeNull();
  });

  it('maps an entity to a full insert payload (every derived column) round-trip', () => {
    const submission = PresentationSubmission.reconstitute({
      id: 'sub-9',
      roomId: 'room-9',
      teamId: 'team-9',
      uploadedByPlayerId: null,
      originalFileName: 'late.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize: 9001,
      storageProvider: 'minio',
      bucket: 'svoya-igra',
      storageKey: 'rooms/room-9/presentations/team-9/sub-9.pptx',
      publicUrl:
        'http://localhost:9000/svoya-igra/rooms/room-9/presentations/team-9/sub-9.pptx',
      uploadedAt,
      deadlineAt,
      isLate: true,
      latePenalty: 5,
      status: 'LATE',
    });

    const insert = mapPresentationSubmissionToInsert(submission);
    expect(insert).toEqual({
      id: 'sub-9',
      roomId: 'room-9',
      teamId: 'team-9',
      uploadedByPlayerId: null,
      originalFileName: 'late.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize: 9001,
      storageProvider: 'minio',
      bucket: 'svoya-igra',
      storageKey: 'rooms/room-9/presentations/team-9/sub-9.pptx',
      publicUrl:
        'http://localhost:9000/svoya-igra/rooms/room-9/presentations/team-9/sub-9.pptx',
      uploadedAt,
      deadlineAt,
      isLate: true,
      latePenalty: 5,
      status: 'LATE',
    });
    expect(
      mapRowToPresentationSubmission(
        insert as typeof presentationSubmissions.$inferSelect,
      ),
    ).toEqual(submission);
  });
});

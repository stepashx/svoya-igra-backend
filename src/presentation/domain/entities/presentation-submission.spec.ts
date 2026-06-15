import { PresentationSubmission } from './presentation-submission';

describe('PresentationSubmission', () => {
  const deadlineAt = new Date('2026-06-14T12:10:00.000Z');

  const baseCreateProps = {
    id: 'sub-1',
    roomId: 'room-1',
    teamId: 'team-1',
    uploadedByPlayerId: 'player-1' as string | null,
    originalFileName: 'deck.pdf',
    mimeType: 'application/pdf',
    fileSize: 2048,
    storageProvider: 'minio',
    bucket: 'svoya-igra',
    storageKey: 'rooms/room-1/presentations/team-1/sub-1.pdf',
    publicUrl:
      'http://localhost:9000/svoya-igra/rooms/room-1/presentations/team-1/sub-1.pdf',
    deadlineAt,
    latePenalty: 5,
  };

  it('derives UPLOADED with no penalty for an on-time upload', () => {
    const now = new Date('2026-06-14T12:05:00.000Z');
    const submission = PresentationSubmission.create(baseCreateProps, now);

    expect(submission.status).toBe('UPLOADED');
    expect(submission.isLate).toBe(false);
    // EFFECTIVE penalty: 0 on time, even though the configured value was 5.
    expect(submission.latePenalty).toBe(0);
    expect(submission.uploadedAt).toBe(now);
    expect(submission.storageProvider).toBe('minio');
  });

  it('derives LATE and stores the configured penalty for a late upload', () => {
    const now = new Date('2026-06-14T12:15:00.000Z');
    const submission = PresentationSubmission.create(baseCreateProps, now);

    expect(submission.status).toBe('LATE');
    expect(submission.isLate).toBe(true);
    expect(submission.latePenalty).toBe(5);
    expect(submission.uploadedAt).toBe(now);
  });

  it('treats an upload exactly at the deadline as on time (now > deadline is strict)', () => {
    const submission = PresentationSubmission.create(
      baseCreateProps,
      deadlineAt,
    );
    expect(submission.isLate).toBe(false);
    expect(submission.status).toBe('UPLOADED');
    expect(submission.latePenalty).toBe(0);
  });

  it('carries a null uploadedByPlayerId through create', () => {
    const submission = PresentationSubmission.create(
      { ...baseCreateProps, uploadedByPlayerId: null },
      new Date('2026-06-14T12:05:00.000Z'),
    );
    expect(submission.uploadedByPlayerId).toBeNull();
  });

  it('reconstitutes a persisted submission round-trip (all 16 fields)', () => {
    const uploadedAt = new Date('2026-06-14T12:09:00.000Z');
    const submission = PresentationSubmission.reconstitute({
      id: 'sub-2',
      roomId: 'room-2',
      teamId: 'team-2',
      uploadedByPlayerId: null,
      originalFileName: 'slides.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      fileSize: 4096,
      storageProvider: 'minio',
      bucket: 'svoya-igra',
      storageKey: 'rooms/room-2/presentations/team-2/sub-2.pptx',
      publicUrl:
        'http://localhost:9000/svoya-igra/rooms/room-2/presentations/team-2/sub-2.pptx',
      uploadedAt,
      deadlineAt,
      isLate: false,
      latePenalty: 0,
      status: 'UPLOADED',
    });

    expect(submission.id).toBe('sub-2');
    expect(submission.roomId).toBe('room-2');
    expect(submission.teamId).toBe('team-2');
    expect(submission.uploadedByPlayerId).toBeNull();
    expect(submission.originalFileName).toBe('slides.pptx');
    expect(submission.mimeType).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(submission.fileSize).toBe(4096);
    expect(submission.storageProvider).toBe('minio');
    expect(submission.bucket).toBe('svoya-igra');
    expect(submission.storageKey).toBe(
      'rooms/room-2/presentations/team-2/sub-2.pptx',
    );
    expect(submission.publicUrl).toBe(
      'http://localhost:9000/svoya-igra/rooms/room-2/presentations/team-2/sub-2.pptx',
    );
    expect(submission.uploadedAt).toBe(uploadedAt);
    expect(submission.deadlineAt).toBe(deadlineAt);
    expect(submission.isLate).toBe(false);
    expect(submission.latePenalty).toBe(0);
    expect(submission.status).toBe('UPLOADED');
  });

  it('is immutable: fields are getter-only (no setters)', () => {
    const submission = PresentationSubmission.create(
      baseCreateProps,
      new Date('2026-06-14T12:05:00.000Z'),
    );
    expect(() => {
      (submission as unknown as { status: string }).status = 'LATE';
    }).toThrow(TypeError);
  });
});

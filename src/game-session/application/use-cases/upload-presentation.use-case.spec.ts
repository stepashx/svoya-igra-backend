import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { PresentationSubmissionConflictError } from '../../../presentation/domain/errors';
import {
  NotTeamCaptainError,
  PreparationNotStartedError,
  RoomNotActiveError,
  RoomNotFoundError,
  UnsupportedPresentationFormatError,
} from '../../domain/errors';
import { PresentationEvent, presentationFileSummary } from '../events';
import { PresentationTimerRegistry } from '../timers';
import { UploadPresentationUseCase } from './upload-presentation.use-case';
import {
  FIXED_NOW,
  makeClock,
  makeConfig,
  makeFileStorage,
  makeIdGenerator,
  makePlayer,
  makePlayerRepo,
  makePresentationSubmission,
  makePresentationSubmissionRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTransactionPort,
  STORED_LOCATOR,
} from './lobby-test-doubles';

/** A timer projection stub — only `status` + `endsAt` matter to the use case. */
const timerStub = (
  status: 'RUNNING' | 'EXPIRED' | 'IDLE',
  endsAt: Date | null,
): PresentationTimerRegistry =>
  ({
    read: jest.fn().mockReturnValue({
      status,
      startedAt: endsAt,
      endsAt,
      remainingMs: 0,
    }),
  }) as unknown as PresentationTimerRegistry;

const FUTURE = new Date(FIXED_NOW.getTime() + 600_000);
const PAST = new Date(FIXED_NOW.getTime() - 1_000);
const runningTimer = (endsAt: Date = FUTURE) => timerStub('RUNNING', endsAt);
const expiredTimer = (endsAt: Date = PAST) => timerStub('EXPIRED', endsAt);
const idleTimer = () => timerStub('IDLE', null);

describe('UploadPresentationUseCase', () => {
  const makeFile = (
    overrides: Partial<{
      originalFileName: string;
      mimeType: string;
      fileSize: number;
      buffer: Buffer;
    }> = {},
  ) => ({
    originalFileName: 'deck.pdf',
    // A HOSTILE client MIME (the stored-XSS vector): the use case must IGNORE it
    // and store the server-canonical application/pdf instead.
    mimeType: 'text/html',
    fileSize: 2048,
    buffer: Buffer.from('<script>alert(1)</script>'),
    ...overrides,
  });

  const INPUT = {
    roomId: 'room-1',
    actingPlayerId: 'captain-1',
    file: makeFile(),
  };

  const build = (
    opts: {
      timer?: PresentationTimerRegistry;
      existing?: ReturnType<typeof makePresentationSubmission> | null;
      catalog?: ReturnType<typeof makePresentationSubmission>[];
      room?: ReturnType<typeof makeRoom>;
      team?: ReturnType<typeof makeTeam>;
      player?: ReturnType<typeof makePlayer>;
    } = {},
  ) => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const players = makePlayerRepo();
    const submissions = makePresentationSubmissionRepo();
    const fileStorage = makeFileStorage();
    const ids = makeIdGenerator();
    const realtime = makeRealtime();
    const timer = opts.timer ?? runningTimer();

    const room =
      opts.room ?? makeRoom({ currentStage: 'PRESENTATION_PREPARATION' });
    const team =
      opts.team ?? makeTeam({ id: 'team-1', captainPlayerId: 'captain-1' });
    const player =
      opts.player ?? makePlayer({ id: 'captain-1', teamId: 'team-1' });

    rooms.findById.mockResolvedValue(room);
    teams.findById.mockResolvedValue(team);
    players.findById.mockResolvedValue(player);
    submissions.findByRoomAndTeam.mockResolvedValue(opts.existing ?? null);
    submissions.findByRoomId.mockResolvedValue(opts.catalog ?? []);

    const uc = new UploadPresentationUseCase(
      makeTransactionPort(),
      rooms,
      teams,
      players,
      submissions,
      fileStorage,
      ids,
      makeClock(),
      realtime,
      timer,
      makeConfig(),
    );

    return {
      uc,
      rooms,
      teams,
      players,
      submissions,
      fileStorage,
      realtime,
      timer,
      room,
      team,
      player,
    };
  };

  it('takes NO team-realtime port — every presentation event is room-wide', () => {
    // 11 ctor params; presentation files are public (§10.15), so there is no
    // team-gated channel as there is for the §16.5 QR inventory.
    expect(UploadPresentationUseCase.length).toBe(11);
  });

  it('uploads on time: canonical MIME (not the client type), create, attach, two events', async () => {
    const ctx = build({ catalog: [makePresentationSubmission()] });

    const result = await ctx.uc.execute(INPUT);

    // Stored under the canonical server MIME from the EXTENSION — NEVER the
    // hostile client text/html — and the clean allowlist extension token.
    expect(ctx.fileStorage.putPresentation).toHaveBeenCalledTimes(1);
    expect(ctx.fileStorage.putPresentation).toHaveBeenCalledWith({
      roomId: 'room-1',
      teamId: 'team-1',
      submissionId: 'id-1',
      extension: 'pdf',
      body: INPUT.file.buffer,
      size: 2048,
      contentType: 'application/pdf',
    });

    // First upload → create (not replace); the row carries the canonical MIME.
    expect(ctx.submissions.create).toHaveBeenCalledTimes(1);
    expect(ctx.submissions.replace).not.toHaveBeenCalled();
    const created = ctx.submissions.create.mock.calls[0][0];
    expect(created.mimeType).toBe('application/pdf');
    expect(created.isLate).toBe(false);
    expect(created.status).toBe('UPLOADED');
    expect(created.latePenalty).toBe(0);
    expect(created.publicUrl).toBe(STORED_LOCATOR.publicUrl);

    // Team link persisted.
    expect(ctx.team.presentationSubmissionId).toBe('id-1');
    expect(ctx.teams.update).toHaveBeenCalledWith(ctx.team);

    // Room broadcasts: uploaded then files-updated (no late). publicUrl carried.
    const events = ctx.realtime.emitToRoom.mock.calls.map(([, e]) => e);
    expect(events).toEqual([
      PresentationEvent.SubmissionUploaded,
      PresentationEvent.FilesUpdated,
    ]);
    expect(ctx.realtime.emitToRoom.mock.calls[0][2]).toMatchObject({
      roomId: 'room-1',
      teamId: 'team-1',
      submission: { publicUrl: STORED_LOCATOR.publicUrl, status: 'UPLOADED' },
    });
    expect(ctx.realtime.emitToRoom.mock.calls[1][2]).toEqual({
      roomId: 'room-1',
      files: [makePresentationSubmission()].map(presentationFileSummary),
    });

    expect(result.publicUrl).toBe(STORED_LOCATOR.publicUrl);
    expect(result.isCreate).toBe(true);
  });

  it('uploads the bytes BEFORE opening the transaction lock (two-phase)', async () => {
    const ctx = build();

    await ctx.uc.execute(INPUT);

    // The MinIO write must happen outside/before the locked tx so a big upload
    // never pins a pooled connection (recon M1).
    const uploadOrder =
      ctx.fileStorage.putPresentation.mock.invocationCallOrder[0];
    const lockOrder = ctx.rooms.acquireRoomLock.mock.invocationCallOrder[0];
    expect(uploadOrder).toBeLessThan(lockOrder);
  });

  it('GUARD: the lock is load-bearing — acquired before the create/replace write', async () => {
    const ctx = build();

    await ctx.uc.execute(INPUT);

    // The per-room lock + the in-tx re-read of findByRoomAndTeam are what make
    // the create path's 23505 unreachable in practice (defensive only).
    expect(ctx.rooms.acquireRoomLock).toHaveBeenCalledTimes(1);
    expect(ctx.rooms.acquireRoomLock).toHaveBeenCalledWith('room-1');
    const lockOrder = ctx.rooms.acquireRoomLock.mock.invocationCallOrder[0];
    const createOrder = ctx.submissions.create.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(createOrder);
  });

  it('marks a late upload LATE with the effective penalty and emits submission-late', async () => {
    const ctx = build({ timer: expiredTimer(), catalog: [] });

    const result = await ctx.uc.execute(INPUT);

    const created = ctx.submissions.create.mock.calls[0][0];
    expect(created.isLate).toBe(true);
    expect(created.status).toBe('LATE');
    expect(created.latePenalty).toBe(1); // LATE_PENALTY=1 (env, not the plan's 2)

    const events = ctx.realtime.emitToRoom.mock.calls.map(([, e]) => e);
    expect(events).toEqual([
      PresentationEvent.SubmissionUploaded,
      PresentationEvent.SubmissionLate,
      PresentationEvent.FilesUpdated,
    ]);
    const latePayload = ctx.realtime.emitToRoom.mock.calls.find(
      ([, e]) => e === PresentationEvent.SubmissionLate,
    )?.[2];
    expect(latePayload).toEqual({
      roomId: 'room-1',
      teamId: 'team-1',
      submissionId: created.id,
      latePenalty: 1,
    });
    expect(result.submission.isLate).toBe(true);
  });

  describe('isLate boundary (strict now > deadline)', () => {
    it('is UPLOADED when the deadline is 1ms in the future', async () => {
      const ctx = build({
        timer: runningTimer(new Date(FIXED_NOW.getTime() + 1)),
      });
      await ctx.uc.execute(INPUT);
      expect(ctx.submissions.create.mock.calls[0][0].isLate).toBe(false);
    });

    it('is UPLOADED exactly AT the deadline (boundary is on-time)', async () => {
      const ctx = build({ timer: runningTimer(new Date(FIXED_NOW.getTime())) });
      await ctx.uc.execute(INPUT);
      expect(ctx.submissions.create.mock.calls[0][0].isLate).toBe(false);
    });

    it('is LATE when the deadline is 1ms in the past', async () => {
      const ctx = build({
        timer: expiredTimer(new Date(FIXED_NOW.getTime() - 1)),
      });
      await ctx.uc.execute(INPUT);
      expect(ctx.submissions.create.mock.calls[0][0].isLate).toBe(true);
    });
  });

  describe('replace (re-upload)', () => {
    it('reuses the existing id, UPDATEs in place, and emits submission-replaced', async () => {
      const existing = makePresentationSubmission({ id: 'existing-sub' });
      const ctx = build({ existing, catalog: [existing] });

      const result = await ctx.uc.execute(INPUT);

      // Existing id reused → object overwritten in place (no orphan, no new id).
      expect(
        ctx.fileStorage.putPresentation.mock.calls[0][0].submissionId,
      ).toBe('existing-sub');
      expect(ctx.submissions.replace).toHaveBeenCalledTimes(1);
      expect(ctx.submissions.create).not.toHaveBeenCalled();
      expect(ctx.submissions.replace.mock.calls[0][0].id).toBe('existing-sub');

      const events = ctx.realtime.emitToRoom.mock.calls.map(([, e]) => e);
      expect(events).toEqual([
        PresentationEvent.SubmissionReplaced,
        PresentationEvent.FilesUpdated,
      ]);
      expect(result.isCreate).toBe(false);
    });

    it('an on-time replace of a LATE submission CLEARS the late flag', async () => {
      // The prior submission was LATE; the timer is now RUNNING (on time).
      const existing = makePresentationSubmission({
        id: 'existing-sub',
        isLate: true,
        latePenalty: 1,
        status: 'LATE',
      });
      const ctx = build({ existing, timer: runningTimer() });

      await ctx.uc.execute(INPUT);

      const replaced = ctx.submissions.replace.mock.calls[0][0];
      expect(replaced.isLate).toBe(false);
      expect(replaced.status).toBe('UPLOADED');
      expect(replaced.latePenalty).toBe(0);
    });
  });

  describe('adversarial original file names', () => {
    const ALLOWLIST = ['pdf', 'ppt', 'pptx'];
    const NUL = String.fromCharCode(0);
    const cases: Array<{ name: string; ext?: string }> = [
      { name: 'a/b.pdf', ext: 'pdf' }, // path-y name, clean ext token
      { name: 'deck.PDF', ext: 'pdf' }, // uppercased extension
      { name: 'talk.ppt', ext: 'ppt' },
      { name: 'slides.pptx', ext: 'pptx' },
      { name: 'archive.tar.pdf', ext: 'pdf' }, // last dot wins
      { name: 'x.pdf/../../y' }, // path injection in the "extension" → reject
      { name: 'README' }, // no dot → reject
      { name: 'slides.tar.gz' }, // disallowed extension → reject
      { name: `x.pdf${NUL}.exe` }, // real null then .exe → ext "exe" → reject
      { name: `evil.pdf${NUL}` }, // trailing real null → ext !== "pdf" → reject
    ];

    it.each(cases)(
      'name "$name" → reject, or upload with a CLEAN allowlist token only',
      async ({ name, ext }) => {
        const ctx = build();
        const input = {
          ...INPUT,
          file: makeFile({ originalFileName: name }),
        };

        if (ext === undefined) {
          await expect(ctx.uc.execute(input)).rejects.toBeInstanceOf(
            UnsupportedPresentationFormatError,
          );
          // Rejected in Phase 1 — the storage write never runs.
          expect(ctx.fileStorage.putPresentation).not.toHaveBeenCalled();
          return;
        }

        await ctx.uc.execute(input);
        const passedExtension =
          ctx.fileStorage.putPresentation.mock.calls[0][0].extension;
        // The raw name NEVER reaches the storage key — only a clean token does.
        expect(passedExtension).toBe(ext);
        expect(ALLOWLIST).toContain(passedExtension);
        // No path separators, dots, spaces, or control chars leak through.
        expect(passedExtension).toMatch(/^[a-z]+$/);
      },
    );
  });

  it('rejects an upload before preparation is started (IDLE timer → 409)', async () => {
    const ctx = build({ timer: idleTimer() });

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      PreparationNotStartedError,
    );
    expect(ctx.fileStorage.putPresentation).not.toHaveBeenCalled();
    expect(ctx.submissions.create).not.toHaveBeenCalled();
  });

  it('rejects a player with no team (403) before uploading', async () => {
    const ctx = build();
    ctx.players.findById.mockResolvedValue(makePlayer({ id: 'captain-1' }));

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      NotTeamCaptainError,
    );
    expect(ctx.fileStorage.putPresentation).not.toHaveBeenCalled();
  });

  it('rejects a non-captain of the team (403) before uploading', async () => {
    const ctx = build();
    ctx.teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', captainPlayerId: 'someone-else' }),
    );

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      NotTeamCaptainError,
    );
    expect(ctx.fileStorage.putPresentation).not.toHaveBeenCalled();
  });

  it('rejects uploading outside PRESENTATION_PREPARATION (409)', async () => {
    const ctx = build({
      room: makeRoom({ currentStage: 'GAME_BOARD' }),
    });

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
    expect(ctx.fileStorage.putPresentation).not.toHaveBeenCalled();
  });

  it('rejects a room that is not ACTIVE (409)', async () => {
    const ctx = build({
      room: makeRoom({
        currentStage: 'PRESENTATION_PREPARATION',
        status: 'CLOSED',
        finishedAt: FIXED_NOW,
      }),
    });

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
    expect(ctx.fileStorage.putPresentation).not.toHaveBeenCalled();
  });

  it('rejects an unknown room (404)', async () => {
    const ctx = build();
    ctx.rooms.findById.mockResolvedValue(null);

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
    expect(ctx.fileStorage.putPresentation).not.toHaveBeenCalled();
  });

  it('rejects a disallowed extension defensively (400) without uploading', async () => {
    const ctx = build();
    const input = {
      ...INPUT,
      file: makeFile({ originalFileName: 'virus.exe' }),
    };

    await expect(ctx.uc.execute(input)).rejects.toBeInstanceOf(
      UnsupportedPresentationFormatError,
    );
    expect(ctx.fileStorage.putPresentation).not.toHaveBeenCalled();
  });

  it('propagates a 23505 conflict from create and writes nothing further (409)', async () => {
    const ctx = build();
    // The defensive backstop: the repo translates a lost unique race.
    ctx.submissions.create.mockRejectedValue(
      new PresentationSubmissionConflictError(),
    );

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      PresentationSubmissionConflictError,
    );
    // The bytes were uploaded (Phase 2), but the team link + events never ran.
    expect(ctx.fileStorage.putPresentation).toHaveBeenCalledTimes(1);
    expect(ctx.teams.update).not.toHaveBeenCalled();
    expect(ctx.realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it('re-checks the stage UNDER the lock and aborts if it advanced during upload', async () => {
    const ctx = build();
    // Phase-1 read is PRESENTATION_PREPARATION; the locked re-read has advanced.
    ctx.rooms.findById
      .mockResolvedValueOnce(
        makeRoom({ currentStage: 'PRESENTATION_PREPARATION' }),
      )
      .mockResolvedValueOnce(
        makeRoom({ currentStage: 'PRESENTATION_DEFENSE' }),
      );

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
    // The upload already happened (Phase 2) but nothing was persisted/emitted.
    expect(ctx.fileStorage.putPresentation).toHaveBeenCalledTimes(1);
    expect(ctx.submissions.create).not.toHaveBeenCalled();
    expect(ctx.realtime.emitToRoom).not.toHaveBeenCalled();
  });
});

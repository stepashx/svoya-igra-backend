import { INestApplication } from '@nestjs/common';
import { AppConfigService } from '../../src/config/app-config.service';
import { FILE_STORAGE_PORT } from '../../src/core/ports/file-storage.port';
import type {
  PutPresentationParams,
  StoredFileLocator,
} from '../../src/core/ports/file-storage.port';
import { PresentationTimerRegistry } from '../../src/game-session/application/timers';
import {
  sleep,
  startBattle as driverStartBattle,
} from '../utils/battle-driver';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import {
  closeDbReadPool,
  readSubmissions,
  readTeamSubmissionId,
} from '../utils/db-read';
import { closeDbWritePool, setRoomStage } from '../utils/db-write';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import { joinRoom } from '../utils/lobby-client';
import {
  getFiles,
  getSubmissions,
  replacePresentation,
  startPreparation,
  uploadPresentation,
  uploadWithoutFile,
} from '../utils/presentation-client';

/**
 * Presentation upload flow over real Postgres + a FAKE FileStoragePort
 * (sub-stage 9.3). The fake records the params and returns a locator built from
 * them, so the suite asserts the two-phase contract (canonical MIME, clean
 * extension token, publicUrl-bearing broadcasts) WITHOUT a live MinIO. The room
 * is parked in PRESENTATION_PREPARATION with setRoomStage (the 8.2 final-shop
 * close lands it there in production) and the host opens preparation; a 3-second
 * timer override exercises the late path in real time.
 */
const FAST_PREP = new PresentationTimerRegistry({
  timers: { presentationPrepSeconds: 3 },
} as unknown as AppConfigService);

/** A FileStoragePort double: records calls, returns a locator built from params. */
const fakeStorage = {
  putPresentation: jest.fn(
    (params: PutPresentationParams): Promise<StoredFileLocator> =>
      Promise.resolve({
        storageProvider: 'minio',
        bucket: 'test-bucket',
        storageKey: `rooms/${params.roomId}/presentations/${params.teamId}/${params.submissionId}.${params.extension}`,
        publicUrl: `http://fake-storage/${params.submissionId}.${params.extension}`,
      }),
  ),
};

const PDF = Buffer.from('%PDF-1.4 fake presentation bytes');
const pdfFile = (filename = 'deck.pdf', contentType = 'application/pdf') => ({
  buffer: PDF,
  filename,
  contentType,
});

describe('Presentation upload flow (e2e)', () => {
  let app: INestApplication;
  let events: CapturedEvent[];

  beforeAll(async () => {
    const e2e = await createE2EApp((builder) =>
      builder
        .overrideProvider(FILE_STORAGE_PORT)
        .useValue(fakeStorage)
        .overrideProvider(PresentationTimerRegistry)
        .useValue(FAST_PREP),
    );
    app = e2e.app;
    events = e2e.events;
  });

  afterAll(async () => {
    await app.close();
    await closeTruncatePool();
    await closeDbWritePool();
    await closeDbReadPool();
  });

  beforeEach(async () => {
    await truncateLobby();
    events.length = 0;
    fakeStorage.putPresentation.mockClear();
  });

  const startBattle = () => driverStartBattle(app);

  /** Park a started room in PRESENTATION_PREPARATION; return the first captain. */
  const prepared = async () => {
    const battle = await startBattle();
    await setRoomStage(battle.roomId, 'PRESENTATION_PREPARATION');
    const [teamId, captainToken] = Object.entries(battle.tokenByTeam)[0];
    return { ...battle, teamId, captainToken };
  };

  const presentationNames = () =>
    events
      .map((e) => e.event)
      .filter((name) => name.startsWith('server:presentation:'));

  it('captain uploads on time: 200, DB row, team link, broadcasts, public reads', async () => {
    const { room, roomId, teamId, captainToken } = await prepared();
    await startPreparation(app, room.code, room.hostToken);
    events.length = 0;

    const res = await uploadPresentation(
      app,
      room.code,
      captainToken,
      pdfFile(),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      isCreate: true,
      teamId,
      originalFileName: 'deck.pdf',
      mimeType: 'application/pdf',
      status: 'UPLOADED',
      isLate: false,
      latePenalty: 0,
    });
    expect(typeof res.body.publicUrl).toBe('string');

    // Persisted row, with the SERVER-canonical MIME.
    const subs = await readSubmissions(roomId);
    expect(subs).toHaveLength(1);
    expect(subs[0].team_id).toBe(teamId);
    expect(subs[0].mime_type).toBe('application/pdf');
    expect(subs[0].status).toBe('UPLOADED');
    expect(subs[0].is_late).toBe(false);
    // The team's denormalised link points at the new row.
    expect(await readTeamSubmissionId(teamId)).toBe(subs[0].id);

    // Room broadcasts: uploaded then files-updated (last), both publicUrl-bearing.
    const names = presentationNames();
    expect(names).toEqual([
      'server:presentation:submission-uploaded',
      'server:presentation:files-updated',
    ]);

    // Public reads reflect the upload.
    const files = await getFiles(app, room.code);
    expect(files.status).toBe(200);
    expect(files.body).toHaveLength(1);
    expect(files.body[0]).toMatchObject({
      teamId,
      originalFileName: 'deck.pdf',
    });

    const submissions = await getSubmissions(app, room.code);
    expect(submissions.body[0]).toMatchObject({
      teamId,
      status: 'UPLOADED',
      originalFileName: 'deck.pdf',
      fileSize: PDF.length,
    });
  });

  it('stores the canonical MIME from the extension, IGNORING a hostile client type', async () => {
    const { room, roomId, captainToken } = await prepared();
    await startPreparation(app, room.code, room.hostToken);

    // A .pdf uploaded with a text/html content-type (the stored-XSS vector).
    const res = await uploadPresentation(
      app,
      room.code,
      captainToken,
      pdfFile('evil.pdf', 'text/html'),
    );
    expect(res.status).toBe(200);

    // The storage layer received application/pdf + the clean extension token.
    expect(fakeStorage.putPresentation).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'application/pdf',
        extension: 'pdf',
      }),
    );
    const subs = await readSubmissions(roomId);
    expect(subs[0].mime_type).toBe('application/pdf');
  });

  it('accepts a real PDF buffer sent as application/pdf', async () => {
    const { room, captainToken } = await prepared();
    await startPreparation(app, room.code, room.hostToken);

    const res = await uploadPresentation(
      app,
      room.code,
      captainToken,
      pdfFile(),
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UPLOADED');
  });

  it('marks a past-deadline upload LATE and emits submission-late', async () => {
    const { room, roomId, captainToken } = await prepared();
    await startPreparation(app, room.code, room.hostToken);
    events.length = 0;

    await sleep(3_100); // past the 3s preparation window
    const res = await uploadPresentation(
      app,
      room.code,
      captainToken,
      pdfFile(),
    );
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('LATE');
    expect(res.body.isLate).toBe(true);
    expect(res.body.latePenalty).toBe(1); // LATE_PENALTY=1 (env)

    const subs = await readSubmissions(roomId);
    expect(subs[0].is_late).toBe(true);
    expect(subs[0].late_penalty).toBe(1);

    expect(presentationNames()).toEqual([
      'server:presentation:submission-uploaded',
      'server:presentation:submission-late',
      'server:presentation:files-updated',
    ]);
  });

  it('replace (PUT) updates the SAME row id and emits submission-replaced', async () => {
    const { room, roomId, teamId, captainToken } = await prepared();
    await startPreparation(app, room.code, room.hostToken);

    const first = await uploadPresentation(
      app,
      room.code,
      captainToken,
      pdfFile('first.pdf'),
    );
    expect(first.status).toBe(200);
    const firstId = (await readSubmissions(roomId))[0].id;
    events.length = 0;

    const replaced = await replacePresentation(
      app,
      room.code,
      captainToken,
      pdfFile('second.pdf'),
    );
    expect(replaced.status).toBe(200);
    expect(replaced.body.isCreate).toBe(false);
    expect(replaced.body.originalFileName).toBe('second.pdf');

    // Still exactly one row — overwritten in place under the same id.
    const subs = await readSubmissions(roomId);
    expect(subs).toHaveLength(1);
    expect(subs[0].id).toBe(firstId);
    expect(subs[0].original_file_name).toBe('second.pdf');
    expect(await readTeamSubmissionId(teamId)).toBe(firstId);

    expect(presentationNames()).toEqual([
      'server:presentation:submission-replaced',
      'server:presentation:files-updated',
    ]);
  });

  it('rejects a non-captain with 403 and writes nothing', async () => {
    const { room, roomId } = await prepared();
    await startPreparation(app, room.code, room.hostToken);
    // A fresh player who joined the room but is on no team (not a captain).
    const carol = await joinRoom(app, room.code, 'Carol');

    const res = await uploadPresentation(
      app,
      room.code,
      carol.token,
      pdfFile(),
    );
    expect(res.status).toBe(403);
    expect(await readSubmissions(roomId)).toHaveLength(0);
  });

  it('rejects an upload outside PRESENTATION_PREPARATION with 409', async () => {
    // A started room stays in GAME_BOARD (no setRoomStage / start-preparation).
    const battle = await startBattle();
    const [, captainToken] = Object.entries(battle.tokenByTeam)[0];

    const res = await uploadPresentation(
      app,
      battle.room.code,
      captainToken,
      pdfFile(),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNEXPECTED_GAME_STAGE');
  });

  it('rejects an upload before preparation is started with 409 PREPARATION_NOT_STARTED', async () => {
    // Stage is set, but the host never opened preparation → IDLE timer.
    const { room, captainToken } = await prepared();

    const res = await uploadPresentation(
      app,
      room.code,
      captainToken,
      pdfFile(),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PREPARATION_NOT_STARTED');
  });

  it('rejects a disallowed extension with 400 (the fileFilter, never a 500)', async () => {
    const { room, captainToken } = await prepared();
    await startPreparation(app, room.code, room.hostToken);

    const exe = await uploadPresentation(app, room.code, captainToken, {
      buffer: Buffer.from('MZ'),
      filename: 'virus.exe',
      contentType: 'application/octet-stream',
    });
    expect(exe.status).toBe(400);

    const txt = await uploadPresentation(app, room.code, captainToken, {
      buffer: Buffer.from('notes'),
      filename: 'notes.txt',
      contentType: 'text/plain',
    });
    expect(txt.status).toBe(400);
  });

  it('rejects a missing or mis-named file part with 400 (ParseFilePipe / multer)', async () => {
    const { room, captainToken } = await prepared();
    await startPreparation(app, room.code, room.hostToken);

    const noFile = await uploadWithoutFile(app, room.code, captainToken);
    expect(noFile.status).toBe(400);

    const wrongField = await uploadPresentation(app, room.code, captainToken, {
      ...pdfFile(),
      field: 'wrongfield',
    });
    expect(wrongField.status).toBe(400);
  });

  it('rejects an over-size upload with 413 (multer limit, never a 500)', async () => {
    const { room, captainToken } = await prepared();
    await startPreparation(app, room.code, room.hostToken);

    // 26 MB > the 25 MB default limit.
    const big = Buffer.alloc(26 * 1024 * 1024, 0x41);
    const res = await uploadPresentation(app, room.code, captainToken, {
      buffer: big,
      filename: 'big.pdf',
      contentType: 'application/pdf',
    });
    expect(res.status).toBe(413);
  });
});

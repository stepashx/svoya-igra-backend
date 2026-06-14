import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppConfigService } from '../../src/config/app-config.service';
import { PresentationTimerRegistry } from '../../src/game-session/application/timers';
import {
  sleep,
  startBattle as driverStartBattle,
} from '../utils/battle-driver';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import { closeDbWritePool, setRoomStage } from '../utils/db-write';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import { HOST_HEADER } from '../utils/gameplay-client';
import { createRoom } from '../utils/lobby-client';

/**
 * Presentation preparation flow over real Postgres (sub-stage 9.2): the host
 * opens preparation (first §16.6 emission — `preparation-started` +
 * `timer-started`) and the public deadline / submissions reads. The room is
 * parked in PRESENTATION_PREPARATION with a raw `current_stage` UPDATE
 * (setRoomStage) instead of grinding the board to exhaustion — the 8.2
 * shop-flow suite already proves the live final-shop → presentations route, so
 * this suite never touches the battle cycle beyond starting a game.
 *
 * The PresentationTimerRegistry is overridden with a 2-second window so the
 * EXPIRED path is exercisable in real time (the PRESENTATION_PREP_SECONDS env
 * cannot be overridden per-suite — ConfigModule.forRoot evaluates at import).
 */
const FAST_PREP_TIMER = new PresentationTimerRegistry({
  timers: { presentationPrepSeconds: 2 },
} as unknown as AppConfigService);

describe('Presentation preparation flow (e2e)', () => {
  let app: INestApplication;
  let events: CapturedEvent[];

  beforeAll(async () => {
    const e2e = await createE2EApp((builder) =>
      builder
        .overrideProvider(PresentationTimerRegistry)
        .useValue(FAST_PREP_TIMER),
    );
    app = e2e.app;
    events = e2e.events;
  });

  afterAll(async () => {
    await app.close();
    await closeTruncatePool();
    await closeDbWritePool();
  });

  beforeEach(async () => {
    await truncateLobby();
    events.length = 0;
  });

  const startBattle = () => driverStartBattle(app);
  const http = () => request(app.getHttpServer());

  const startPreparation = (code: string, hostToken: string) =>
    http()
      .post(`/api/rooms/${code}/presentation/start-preparation`)
      .set(HOST_HEADER, hostToken);
  const getDeadline = (code: string) =>
    http().get(`/api/rooms/${code}/presentation/deadline`);
  const getSubmissions = (code: string) =>
    http().get(`/api/rooms/${code}/presentation/submissions`);

  it('reads an IDLE deadline before preparation is started', async () => {
    // GET deadline is a public registry read — no stage gating, no timer yet.
    const { room } = await startBattle();
    const deadline = await getDeadline(room.code);
    expect(deadline.status).toBe(200);
    expect(deadline.body.status).toBe('IDLE');
    expect(deadline.body.startedAt).toBeNull();
    expect(deadline.body.endsAt).toBeNull();
    expect(deadline.body.remainingMs).toBe(0);
  });

  it('host opens preparation: 200 RUNNING deadline, room-wide events, live reads', async () => {
    const { room, roomId } = await startBattle();
    // Park the room in PRESENTATION_PREPARATION (the 8.2 final-shop close lands
    // it here in production); 9.2 does NOT move the stage.
    await setRoomStage(roomId, 'PRESENTATION_PREPARATION');
    events.length = 0;

    const started = await startPreparation(room.code, room.hostToken);
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('RUNNING');
    expect(typeof started.body.endsAt).toBe('string');
    expect(started.body.remainingMs).toBeGreaterThan(0);

    // Both presentation broadcasts fired room-wide, in order, public payloads.
    const names = events.map((event) => event.event);
    const prepIdx = names.indexOf('server:presentation:preparation-started');
    const timerIdx = names.indexOf('server:presentation:timer-started');
    expect(prepIdx).toBeGreaterThanOrEqual(0);
    expect(timerIdx).toBeGreaterThan(prepIdx);

    const prep = events[prepIdx];
    expect(prep.roomId).toBe(roomId);
    expect(prep.payload).toMatchObject({
      roomId,
      stage: 'PRESENTATION_PREPARATION',
    });
    const timer = events[timerIdx];
    expect(timer.roomId).toBe(roomId);
    const timerPayload = timer.payload as { roomId: string; endsAt: Date };
    expect(timerPayload.roomId).toBe(roomId);
    expect(timerPayload.endsAt).toBeDefined();

    // GET deadline reflects the SAME running timer (same endsAt).
    const deadline = await getDeadline(room.code);
    expect(deadline.status).toBe(200);
    expect(deadline.body.status).toBe('RUNNING');
    expect(deadline.body.endsAt).toBe(started.body.endsAt);

    // GET submissions is live and empty (no uploads until 9.3).
    const submissions = await getSubmissions(room.code);
    expect(submissions.status).toBe(200);
    expect(submissions.body).toEqual([]);
  });

  it('a repeat start REPLACES the timer (fresh endsAt) and re-emits both events', async () => {
    const { room, roomId } = await startBattle();
    await setRoomStage(roomId, 'PRESENTATION_PREPARATION');

    const first = await startPreparation(room.code, room.hostToken);
    expect(first.status).toBe(200);

    events.length = 0;
    const second = await startPreparation(room.code, room.hostToken);
    expect(second.status).toBe(200);
    // A later start wins: the new endsAt is at/after the first (fresh stamps).
    expect(new Date(second.body.endsAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.body.endsAt).getTime(),
    );

    const names = events.map((event) => event.event);
    expect(names).toContain('server:presentation:preparation-started');
    expect(names).toContain('server:presentation:timer-started');
  });

  it('rejects a non-host start with 403', async () => {
    const { room, roomId } = await startBattle();
    await setRoomStage(roomId, 'PRESENTATION_PREPARATION');

    const res = await startPreparation(room.code, 'not-the-host');
    expect(res.status).toBe(403);
    // No event leaked from the rejected attempt.
    expect(
      events.filter((event) => event.event.startsWith('server:presentation:')),
    ).toEqual([]);
  });

  it('rejects start outside PRESENTATION_PREPARATION with 409 UNEXPECTED_GAME_STAGE', async () => {
    // A fresh room is in LOBBY (no setRoomStage) — wrong stage for preparation.
    const room = await createRoom(app);

    const res = await startPreparation(room.code, room.hostToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNEXPECTED_GAME_STAGE');
  });

  it('surfaces EXPIRED via GET deadline once the 2s window elapses', async () => {
    const { room, roomId } = await startBattle();
    await setRoomStage(roomId, 'PRESENTATION_PREPARATION');

    const started = await startPreparation(room.code, room.hostToken);
    expect(started.status).toBe(200);

    await sleep(2_100);
    const deadline = await getDeadline(room.code);
    expect(deadline.status).toBe(200);
    expect(deadline.body.status).toBe('EXPIRED');
    expect(deadline.body.remainingMs).toBe(0);
  });
});

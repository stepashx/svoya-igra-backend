import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startBattle as driverStartBattle } from '../utils/battle-driver';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import { closeDbWritePool, setRoomStage } from '../utils/db-write';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import { HOST_HEADER } from '../utils/gameplay-client';
import { createRoom } from '../utils/lobby-client';

/**
 * Presentation defense flow over real Postgres (sub-stage 10.1): the host opens
 * the defenses (PRESENTATION_PREPARATION → PRESENTATION_DEFENSE), advances the
 * queue with finish/skip, and the last presenter moves the room on to EVALUATION
 * — all `server:defense:*` room-wide. The room is parked in
 * PRESENTATION_PREPARATION with a raw `current_stage` UPDATE (setRoomStage)
 * instead of grinding the board to exhaustion: the 8.2/9.2 suites already prove
 * the live route here, so this suite never touches the battle cycle beyond
 * `startBattle` (which gives two teams with turnOrder 0/1).
 *
 * The defense state is fully DERIVED (currentTeamId + turnOrder) — there is no
 * timer, so no registry override is needed (unlike the 9.2 presentation suite).
 */
describe('Presentation defense flow (e2e)', () => {
  let app: INestApplication;
  let events: CapturedEvent[];

  beforeAll(async () => {
    const e2e = await createE2EApp();
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

  const startDefense = (code: string, hostToken: string) =>
    http().post(`/api/rooms/${code}/defense/start`).set(HOST_HEADER, hostToken);
  const finishPresenter = (code: string, hostToken: string) =>
    http()
      .post(`/api/rooms/${code}/defense/finish-presenter`)
      .set(HOST_HEADER, hostToken);
  const skipPresenter = (code: string, hostToken: string) =>
    http()
      .post(`/api/rooms/${code}/defense/skip-presenter`)
      .set(HOST_HEADER, hostToken);
  const getDefenseState = (code: string) =>
    http().get(`/api/rooms/${code}/defense/state`);
  const getStage = (code: string) =>
    http().get(`/api/rooms/${code}/game/stage`);

  const eventNames = () => events.map((event) => event.event);
  const defenseEvents = () =>
    events.filter((event) => event.event.startsWith('server:defense:'));

  /** Start a game and park it in PRESENTATION_PREPARATION; clear the recorder. */
  const reachPreparation = async () => {
    const battle = await startBattle();
    await setRoomStage(battle.roomId, 'PRESENTATION_PREPARATION');
    events.length = 0;
    return battle;
  };

  it('GET state before defenses are opened reflects PRESENTATION_PREPARATION (derived order)', async () => {
    const { room } = await reachPreparation();

    const state = await getDefenseState(room.code);
    expect(state.status).toBe(200);
    expect(state.body.currentStage).toBe('PRESENTATION_PREPARATION');
    // The order is derived from the two participating teams' turnOrder.
    expect(state.body.order).toHaveLength(2);
    // No defense broadcast has fired yet.
    expect(defenseEvents()).toEqual([]);
  });

  it('host opens defenses: 200 DEFENSE, started BEFORE team-started, first presenter on', async () => {
    const { room, roomId } = await reachPreparation();

    const started = await startDefense(room.code, room.hostToken);
    expect(started.status).toBe(200);
    expect(started.body.currentStage).toBe('PRESENTATION_DEFENSE');
    expect(started.body.order).toHaveLength(2);
    // The first presenter is the head of the turnOrder-ascending order.
    expect(started.body.currentPresenterTeamId).toBe(started.body.order[0]);

    // started (with the whole order) fired room-wide BEFORE team-started.
    const names = eventNames();
    const startedIdx = names.indexOf('server:defense:started');
    const teamStartedIdx = names.indexOf('server:defense:team-started');
    expect(startedIdx).toBeGreaterThanOrEqual(0);
    expect(teamStartedIdx).toBeGreaterThan(startedIdx);
    expect(events[startedIdx].roomId).toBe(roomId);
    expect(events[startedIdx].payload).toMatchObject({
      roomId,
      order: started.body.order,
    });
    expect(events[teamStartedIdx].payload).toMatchObject({
      roomId,
      teamId: started.body.order[0],
    });

    // GET state mirrors the live defense state (reconnect/refresh).
    const state = await getDefenseState(room.code);
    expect(state.status).toBe(200);
    expect(state.body.currentStage).toBe('PRESENTATION_DEFENSE');
    expect(state.body.currentPresenterTeamId).toBe(started.body.order[0]);
    expect(state.body.order).toEqual(started.body.order);
  });

  it('finish-presenter advances the queue, then the LAST one moves on to EVALUATION', async () => {
    const { room, roomId } = await reachPreparation();
    const started = await startDefense(room.code, room.hostToken);
    const order: string[] = started.body.order;
    events.length = 0;

    // Finish the first presenter → advance to the second, stay in DEFENSE.
    const first = await finishPresenter(room.code, room.hostToken);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      currentStage: 'PRESENTATION_DEFENSE',
      currentPresenterTeamId: order[1],
      finished: false,
    });
    expect(eventNames()).toEqual([
      'server:defense:team-finished',
      'server:defense:team-started',
    ]);
    expect(events[0].payload).toMatchObject({ roomId, teamId: order[0] });
    expect(events[1].payload).toMatchObject({ roomId, teamId: order[1] });

    events.length = 0;
    // Finish the LAST presenter → DEFENSE → EVALUATION.
    const last = await finishPresenter(room.code, room.hostToken);
    expect(last.status).toBe(200);
    expect(last.body).toMatchObject({
      currentStage: 'EVALUATION',
      currentPresenterTeamId: null,
      finished: true,
    });
    expect(eventNames()).toEqual([
      'server:defense:team-finished',
      'server:defense:finished',
    ]);
    expect(events[1].payload).toMatchObject({
      roomId,
      nextStage: 'EVALUATION',
    });

    // The room really advanced (the EVALUATION edge is live).
    const stage = await getStage(room.code);
    expect(stage.status).toBe(200);
    expect(stage.body.currentStage).toBe('EVALUATION');
  });

  it('skip-presenter emits team-skipped (not team-finished) and runs the queue to EVALUATION', async () => {
    const { room, roomId } = await reachPreparation();
    const started = await startDefense(room.code, room.hostToken);
    const order: string[] = started.body.order;
    events.length = 0;

    // Skip the first presenter → advance, stay in DEFENSE.
    const first = await skipPresenter(room.code, room.hostToken);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      currentStage: 'PRESENTATION_DEFENSE',
      currentPresenterTeamId: order[1],
      finished: false,
    });
    expect(eventNames()).toEqual([
      'server:defense:team-skipped',
      'server:defense:team-started',
    ]);
    expect(eventNames()).not.toContain('server:defense:team-finished');
    expect(events[0].payload).toMatchObject({ roomId, teamId: order[0] });

    events.length = 0;
    // Skip the LAST presenter → EVALUATION.
    const last = await skipPresenter(room.code, room.hostToken);
    expect(last.status).toBe(200);
    expect(last.body).toMatchObject({
      currentStage: 'EVALUATION',
      currentPresenterTeamId: null,
      finished: true,
    });
    expect(eventNames()).toEqual([
      'server:defense:team-skipped',
      'server:defense:finished',
    ]);

    const stage = await getStage(room.code);
    expect(stage.body.currentStage).toBe('EVALUATION');
  });

  it('rejects a non-host start with 403 — no defense events leak', async () => {
    const { room } = await reachPreparation();

    const res = await startDefense(room.code, 'not-the-host');
    expect(res.status).toBe(403);
    expect(defenseEvents()).toEqual([]);
  });

  it('rejects start outside PRESENTATION_PREPARATION with 409 UNEXPECTED_GAME_STAGE', async () => {
    // A fresh room is in LOBBY — the wrong stage to open defenses.
    const room = await createRoom(app);

    const res = await startDefense(room.code, room.hostToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNEXPECTED_GAME_STAGE');
    expect(defenseEvents()).toEqual([]);
  });

  it('rejects finish-presenter before defenses are opened with 409 UNEXPECTED_GAME_STAGE', async () => {
    const { room } = await reachPreparation(); // still PRESENTATION_PREPARATION

    const res = await finishPresenter(room.code, room.hostToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNEXPECTED_GAME_STAGE');
    expect(defenseEvents()).toEqual([]);
  });
});

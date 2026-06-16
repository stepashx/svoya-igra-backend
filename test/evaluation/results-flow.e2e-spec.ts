import { INestApplication } from '@nestjs/common';
import { Socket } from 'socket.io-client';
import request from 'supertest';
import { startBattle as driverStartBattle } from '../utils/battle-driver';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import {
  closeDbReadPool,
  readFinalResults,
  readRoomLifecycle,
} from '../utils/db-read';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import {
  closeDbWritePool,
  insertPhantomTeam,
  presetLateSubmission,
  presetTeamScores,
  setRoomStage,
} from '../utils/db-write';
import { HOST_HEADER, PLAYER_HEADER } from '../utils/lobby-client';
import {
  awaitConnect,
  awaitEvent,
  closeSockets,
  connectRealtime,
  settle,
} from '../utils/realtime-client';
import { createRealtimeE2EApp } from '../utils/realtime-e2e-app';

/**
 * Results + game-finish flow over real Postgres (sub-stage 10.3 — the final
 * backbone step). The host POSTs `evaluation/results`: the use case aggregates
 * the confirmed scores, writes `final_results`, moves EVALUATION → RESULTS and
 * finishes the game (status FINISHED), then broadcasts `completed` +
 * `results-calculated` AFTER commit. Scores are submitted/confirmed through the
 * real 10.2 REST surface; the room is parked in EVALUATION with a raw
 * `current_stage` UPDATE (the 10.1/10.2 suites already prove the live route).
 */
describe('Results & game finish flow (e2e)', () => {
  let app: INestApplication;
  let events: CapturedEvent[];

  beforeAll(async () => {
    const e2e = await createE2EApp();
    app = e2e.app;
    events = e2e.events;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateLobby();
    events.length = 0;
  });

  const http = () => request(app.getHttpServer());
  const startBattle = () => driverStartBattle(app);

  const submitTeam = (code: string, token: string, body: object) =>
    http()
      .post(`/api/rooms/${code}/evaluation/team`)
      .set(PLAYER_HEADER, token)
      .send(body);
  const submitHost = (code: string, hostToken: string, body: object) =>
    http()
      .post(`/api/rooms/${code}/evaluation/host`)
      .set(HOST_HEADER, hostToken)
      .send(body);
  const confirmTeam = (code: string, token: string) =>
    http()
      .post(`/api/rooms/${code}/evaluation/team/confirm`)
      .set(PLAYER_HEADER, token)
      .send({});
  const confirmHost = (code: string, hostToken: string) =>
    http()
      .post(`/api/rooms/${code}/evaluation/host/confirm`)
      .set(HOST_HEADER, hostToken)
      .send({});
  const postResults = (code: string, hostToken: string, body: object = {}) =>
    http()
      .post(`/api/rooms/${code}/evaluation/results`)
      .set(HOST_HEADER, hostToken)
      .send(body);
  const getResults = (code: string) =>
    http().get(`/api/rooms/${code}/evaluation/results`);

  const resultsEvents = () =>
    events.filter(
      (e) =>
        e.event === 'server:evaluation:completed' ||
        e.event === 'server:evaluation:results-calculated',
    );

  /** Start a game and park it in EVALUATION; expose the two teams + tokens. */
  const reachEvaluation = async () => {
    const battle = await startBattle();
    await setRoomStage(battle.roomId, 'EVALUATION');
    const [teamA, teamB] = Object.keys(battle.tokenByTeam);
    return {
      battle,
      code: battle.room.code,
      hostToken: battle.room.hostToken,
      teamA,
      teamB,
      tokenA: battle.tokenByTeam[teamA],
      tokenB: battle.tokenByTeam[teamB],
    };
  };

  /**
   * Submit + confirm a COMPLETE tally and set the two earned scores. With the
   * given totals: raw A = (1·tBA + 2·hA)/3, raw B = (1·tAB + 2·hB)/3.
   */
  const completeTally = async (ctx: {
    code: string;
    hostToken: string;
    teamA: string;
    teamB: string;
    tokenA: string;
    tokenB: string;
    earnedA?: number;
    earnedB?: number;
    aOnB?: [number, number]; // captain A scoring team B [topic, design]
    bOnA?: [number, number];
    hostOnA?: [number, number];
    hostOnB?: [number, number];
  }) => {
    await presetTeamScores(ctx.teamA, {
      earnedScore: ctx.earnedA ?? 100,
      balance: ctx.earnedA ?? 100,
    });
    await presetTeamScores(ctx.teamB, {
      earnedScore: ctx.earnedB ?? 50,
      balance: ctx.earnedB ?? 50,
    });
    const [bOnA0, bOnA1] = ctx.bOnA ?? [4, 4]; // 8 → raw A = 24/3 = 8
    const [aOnB0, aOnB1] = ctx.aOnB ?? [3, 3]; // 6 → raw B = 18/3 = 6
    const [hA0, hA1] = ctx.hostOnA ?? [4, 4];
    const [hB0, hB1] = ctx.hostOnB ?? [3, 3];
    await submitTeam(ctx.code, ctx.tokenA, {
      targetTeamId: ctx.teamB,
      topicScore: aOnB0,
      designScore: aOnB1,
    });
    await submitTeam(ctx.code, ctx.tokenB, {
      targetTeamId: ctx.teamA,
      topicScore: bOnA0,
      designScore: bOnA1,
    });
    await submitHost(ctx.code, ctx.hostToken, {
      targetTeamId: ctx.teamA,
      topicScore: hA0,
      designScore: hA1,
    });
    await submitHost(ctx.code, ctx.hostToken, {
      targetTeamId: ctx.teamB,
      topicScore: hB0,
      designScore: hB1,
    });
    await confirmTeam(ctx.code, ctx.tokenA);
    await confirmTeam(ctx.code, ctx.tokenB);
    await confirmHost(ctx.code, ctx.hostToken);
  };

  it('CAPSTONE: host calculates results → final_results, dense places, FINISHED', async () => {
    const ctx = await reachEvaluation();
    await completeTally(ctx);
    events.length = 0;

    const res = await postResults(ctx.code, ctx.hostToken);
    expect(res.status).toBe(200);

    // The leaderboard reply is (place, teamId)-ordered with public aggregates.
    expect(res.body.leaderboard).toHaveLength(2);
    expect(res.body.leaderboard[0]).toMatchObject({
      teamId: ctx.teamA,
      earnedScore: 100,
      presentationScoreRaw: 8,
      presentationScoreFinal: 8,
      finalScore: 800,
      place: 1,
    });
    expect(res.body.leaderboard[1]).toMatchObject({
      teamId: ctx.teamB,
      finalScore: 300,
      place: 2,
    });
    // No individual evaluator scores leak (only aggregates).
    expect(JSON.stringify(res.body)).not.toContain('topicScore');

    // Persisted final_results, ordered (place, teamId).
    const rows = await readFinalResults(ctx.battle.roomId);
    expect(rows.map((r) => r.team_id)).toEqual([ctx.teamA, ctx.teamB]);
    expect(rows[0]).toMatchObject({
      earned_score: 100,
      presentation_score_raw: 8,
      presentation_score_final: 8,
      final_score: 800,
      place: 1,
      late_penalty: 0,
    });
    expect(rows[1]).toMatchObject({ final_score: 300, place: 2 });

    // The game finished: RESULTS + FINISHED + finishedAt stamped.
    const room = await readRoomLifecycle(ctx.battle.roomId);
    expect(room?.current_stage).toBe('RESULTS');
    expect(room?.status).toBe('FINISHED');
    expect(room?.finished_at).not.toBeNull();
  });

  it('emits completed then results-calculated AFTER the response (room-wide)', async () => {
    const ctx = await reachEvaluation();
    await completeTally(ctx);
    events.length = 0;

    await postResults(ctx.code, ctx.hostToken);

    expect(resultsEvents().map((e) => e.event)).toEqual([
      'server:evaluation:completed',
      'server:evaluation:results-calculated',
    ]);
    const completed = resultsEvents()[0].payload as Record<string, unknown>;
    expect(completed).toEqual({
      roomId: ctx.battle.roomId,
      stage: 'RESULTS',
      status: 'FINISHED',
    });
    const calculated = resultsEvents()[1].payload as {
      roomId: string;
      leaderboard: Array<{ teamId: string; place: number }>;
    };
    expect(calculated.roomId).toBe(ctx.battle.roomId);
    expect(calculated.leaderboard).toHaveLength(2);
    expect(calculated.leaderboard[0].place).toBe(1);
  });

  it('public GET results returns the sorted leaderboard after calculation', async () => {
    const ctx = await reachEvaluation();
    await completeTally(ctx);
    await postResults(ctx.code, ctx.hostToken);

    const res = await getResults(ctx.code);
    expect(res.status).toBe(200);
    expect(res.body.leaderboard.map((e: { place: number }) => e.place)).toEqual(
      [1, 2],
    );
    expect(res.body.leaderboard[0].teamName).toBeTruthy();
  });

  it('GET results before calculation is an empty leaderboard (200)', async () => {
    const ctx = await reachEvaluation();

    const res = await getResults(ctx.code);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ leaderboard: [] });
  });

  it('⚠️B the completeness gate rejects an incomplete tally (409); force passes', async () => {
    const ctx = await reachEvaluation();
    // No scores submitted → incomplete.
    const blocked = await postResults(ctx.code, ctx.hostToken);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('EVALUATION_NOT_COMPLETE');
    // Nothing was written or finished.
    expect(await readFinalResults(ctx.battle.roomId)).toEqual([]);
    expect((await readRoomLifecycle(ctx.battle.roomId))?.status).toBe('ACTIVE');

    // force bypasses the gate: every participant gets raw 0 → finalScore 0.
    const forced = await postResults(ctx.code, ctx.hostToken, { force: true });
    expect(forced.status).toBe(200);
    const rows = await readFinalResults(ctx.battle.roomId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.final_score === 0)).toBe(true);
    expect((await readRoomLifecycle(ctx.battle.roomId))?.status).toBe(
      'FINISHED',
    );
  });

  it('⚠️A excludes a phantom team (never presented) from final_results', async () => {
    const ctx = await reachEvaluation();
    await completeTally(ctx);
    const phantom = await insertPhantomTeam(ctx.battle.roomId, 'Ghosts');

    const res = await postResults(ctx.code, ctx.hostToken);
    expect(res.status).toBe(200);

    const rows = await readFinalResults(ctx.battle.roomId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.team_id)).not.toContain(phantom);
  });

  it('⚠️F dense tie: two equal teams share place 1', async () => {
    const ctx = await reachEvaluation();
    // Equal earned + equal scores → equal finalScore → both place 1 (dense).
    await completeTally({
      ...ctx,
      earnedA: 100,
      earnedB: 100,
      bOnA: [4, 4],
      aOnB: [4, 4],
      hostOnA: [4, 4],
      hostOnB: [4, 4],
    });

    const res = await postResults(ctx.code, ctx.hostToken);
    expect(res.status).toBe(200);

    const rows = await readFinalResults(ctx.battle.roomId);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.place === 1)).toBe(true);
    expect(rows.every((r) => r.final_score === 800)).toBe(true);
  });

  it('⚠️H snapshots a late submission penalty into final_results', async () => {
    const ctx = await reachEvaluation();
    await completeTally(ctx); // raw A = 8, earned A = 100
    await presetLateSubmission(ctx.battle.roomId, ctx.teamA, 2);

    const res = await postResults(ctx.code, ctx.hostToken);
    expect(res.status).toBe(200);

    const rows = await readFinalResults(ctx.battle.roomId);
    const a = rows.find((r) => r.team_id === ctx.teamA)!;
    expect(a.late_penalty).toBe(2);
    expect(a.presentation_score_final).toBe(6); // max(0, 8 − 2)
    expect(a.final_score).toBe(600); // 100 × 6
  });

  it('rejects a non-host caller with 403', async () => {
    const ctx = await reachEvaluation();
    await completeTally(ctx);
    const res = await http()
      .post(`/api/rooms/${ctx.code}/evaluation/results`)
      .set(PLAYER_HEADER, ctx.tokenA)
      .send({});
    expect(res.status).toBe(403);
  });

  it('⚠️K rejects calculating outside EVALUATION with 409', async () => {
    const battle = await startBattle(); // room is in GAME_BOARD
    const res = await postResults(battle.room.code, battle.room.hostToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNEXPECTED_GAME_STAGE');
  });

  it('⚠️K a repeat after the finish is rejected with 409 (idempotency)', async () => {
    const ctx = await reachEvaluation();
    await completeTally(ctx);
    expect((await postResults(ctx.code, ctx.hostToken)).status).toBe(200);

    const repeat = await postResults(ctx.code, ctx.hostToken);
    expect(repeat.status).toBe(409); // game already FINISHED
    // Still exactly two rows — no second calculation.
    expect(await readFinalResults(ctx.battle.roomId)).toHaveLength(2);
  });

  it('⚠️B4 public GET results works on a FINISHED room; a fresh HTTP join is 409', async () => {
    const ctx = await reachEvaluation();
    await completeTally(ctx);
    await postResults(ctx.code, ctx.hostToken);

    // Public read is reconnect-safe on a FINISHED room.
    const read = await getResults(ctx.code);
    expect(read.status).toBe(200);
    expect(read.body.leaderboard).toHaveLength(2);

    // A NEW HTTP join is closed once the room left ACTIVE (B4 boundary).
    const join = await http()
      .post(`/api/rooms/${ctx.code}/players`)
      .send({ name: 'Latecomer' });
    expect(join.status).toBe(409);
  });
});

/**
 * ⚠️B4 — a WS-token reconnect still works after the game is FINISHED (the
 * reconnect path does not gate on ACTIVE). Uses the live-socket harness; the
 * pools are shared module singletons, closed once in the file-level afterAll.
 */
describe('Results flow — WS reconnect on a FINISHED room (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let wsPath: string;

  beforeAll(async () => {
    const e2e = await createRealtimeE2EApp();
    app = e2e.app;
    port = e2e.port;
    wsPath = e2e.wsPath;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateLobby();
  });

  it('restores a captain socket via its token even after the game finishes', async () => {
    const battle = await driverStartBattle(app);
    await setRoomStage(battle.roomId, 'EVALUATION');
    const [teamA] = Object.keys(battle.tokenByTeam);
    const captainToken = battle.tokenByTeam[teamA];

    // Finish the game (force past the gate — the tally is empty here).
    const res = await request(app.getHttpServer())
      .post(`/api/rooms/${battle.room.code}/evaluation/results`)
      .set(HOST_HEADER, battle.room.hostToken)
      .send({ force: true });
    expect(res.status).toBe(200);

    // A fresh socket with the captain's reconnect token still restores.
    const socket: Socket = connectRealtime(port, {
      path: wsPath,
      reconnectToken: captainToken,
    });
    try {
      const restored = awaitEvent<{ roomId: string }>(
        socket,
        'server:realtime:connection-restored',
      );
      await awaitConnect(socket);
      expect((await restored).roomId).toBe(battle.roomId);
    } finally {
      closeSockets(socket);
      await settle();
    }
  });
});

// File-level cleanup: the db pools are shared singletons across both describes.
afterAll(async () => {
  await closeTruncatePool();
  await closeDbReadPool();
  await closeDbWritePool();
});

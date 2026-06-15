import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startBattle as driverStartBattle } from '../utils/battle-driver';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import { closeDbReadPool, readEvaluationScores } from '../utils/db-read';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import { closeDbWritePool, setRoomStage } from '../utils/db-write';
import {
  createRoom,
  HOST_HEADER,
  joinRoom,
  joinTeam,
  PLAYER_HEADER,
} from '../utils/lobby-client';

/**
 * Evaluation collection flow over real Postgres (sub-stage 10.2): captains and
 * the host submit + confirm scores in EVALUATION, with the §16.8 secrecy
 * (counts-only broadcasts, the author's numbers only in the REST echo). The room
 * is parked in EVALUATION with a raw `current_stage` UPDATE (setRoomStage) — the
 * 10.1 defense suite already proves the live PRESENTATION_DEFENSE → EVALUATION
 * route, so this suite never touches the battle/defense cycles beyond
 * `startBattle` (two teams, turnOrder 0/1, each with a captain token).
 *
 * No timer here (collection is host/captain-paced), so no registry override is
 * needed (unlike the 9.2 presentation suite).
 */
describe('Evaluation collection flow (e2e)', () => {
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
    await closeDbReadPool();
    await closeDbWritePool();
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
  const confirmTeam = (code: string, token: string, body: object = {}) =>
    http()
      .post(`/api/rooms/${code}/evaluation/team/confirm`)
      .set(PLAYER_HEADER, token)
      .send(body);
  const confirmHost = (code: string, hostToken: string, body: object = {}) =>
    http()
      .post(`/api/rooms/${code}/evaluation/host/confirm`)
      .set(HOST_HEADER, hostToken)
      .send(body);
  const getCriteria = (code: string) =>
    http().get(`/api/rooms/${code}/evaluation/criteria`);
  const getTeams = (code: string) =>
    http().get(`/api/rooms/${code}/evaluation/teams`);
  const getProgress = (code: string) =>
    http().get(`/api/rooms/${code}/evaluation/progress`);

  const eventNames = () => events.map((event) => event.event);
  const evaluationEvents = () =>
    events.filter((event) => event.event.startsWith('server:evaluation:'));

  /** Start a game and park it in EVALUATION; clear the recorder. */
  const reachEvaluation = async () => {
    const battle = await startBattle();
    await setRoomStage(battle.roomId, 'EVALUATION');
    events.length = 0;
    const [teamA, teamB] = Object.keys(battle.tokenByTeam);
    return { battle, teamA, teamB, tokenA: battle.tokenByTeam[teamA] };
  };

  const noNumericScore = (payload: unknown) => {
    const json = JSON.stringify(payload);
    expect(json).not.toContain('topicScore');
    expect(json).not.toContain('designScore');
    expect(json).not.toContain('totalScore');
  };

  it('GET criteria returns the two seeded criteria ordered by order', async () => {
    const { battle } = await reachEvaluation();

    const res = await getCriteria(battle.room.code);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.map((c: { order: number }) => c.order)).toEqual([0, 1]);
    expect(res.body[0].title).toBe('Раскрытие темы');
    expect(res.body[0].minScore).toBe(0);
    expect(res.body[0].maxScore).toBe(10);
  });

  it('GET teams lists the two participants; reaching EVALUATION emits nothing', async () => {
    const { battle } = await reachEvaluation();

    const res = await getTeams(battle.room.code);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(evaluationEvents()).toEqual([]);
  });

  it('GET progress before any submission is all zeros with the N² expectation (counts only)', async () => {
    const { battle } = await reachEvaluation();

    const res = await getProgress(battle.room.code);
    expect(res.status).toBe(200);
    expect(res.body.teamCount).toBe(2);
    expect(res.body.team).toEqual({ submitted: 0, confirmed: 0, expected: 2 });
    expect(res.body.host).toEqual({ submitted: 0, confirmed: 0, expected: 2 });
    expect(res.body.totalExpected).toBe(4);
    expect(res.body.complete).toBe(false);
    noNumericScore(res.body);
  });

  it('a captain submits a TEAM score: 200, weight 1, total = topic + design, events carry no numbers', async () => {
    const { battle, teamA, teamB, tokenA } = await reachEvaluation();

    const res = await submitTeam(battle.room.code, tokenA, {
      targetTeamId: teamB,
      topicScore: 7,
      designScore: 5,
    });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
    expect(res.body.score.weight).toBe(1);
    expect(res.body.score.totalScore).toBe(12);
    expect(res.body.score.evaluatorTeamId).toBe(teamA);
    expect(res.body.score.targetTeamId).toBe(teamB);

    // score-submitted then progress-updated, NEITHER carrying numeric scores.
    expect(eventNames()).toEqual([
      'server:evaluation:score-submitted',
      'server:evaluation:progress-updated',
    ]);
    expect(events[0].payload).toMatchObject({
      roomId: battle.roomId,
      targetTeamId: teamB,
      evaluatorType: 'TEAM',
      evaluatorTeamId: teamA,
      created: true,
    });
    noNumericScore(events[0].payload);
    noNumericScore(events[1].payload);

    // Persisted: one TEAM row, weight 1, total = 12, unconfirmed.
    const rows = await readEvaluationScores(battle.roomId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      target_team_id: teamB,
      evaluator_type: 'TEAM',
      evaluator_team_id: teamA,
      host_id: null,
      total_score: 12,
      weight: 1,
    });
    expect(rows[0].confirmed_at).toBeNull();
  });

  it('the host submits a HOST score: weight 2, evaluator_team_id NULL, host_id = room.hostId', async () => {
    const { battle, teamA } = await reachEvaluation();

    const res = await submitHost(battle.room.code, battle.room.hostToken, {
      targetTeamId: teamA,
      topicScore: 8,
      designScore: 6,
    });
    expect(res.status).toBe(200);
    expect(res.body.score.weight).toBe(2);
    expect(res.body.score.evaluatorTeamId).toBeNull();
    expect(res.body.score.totalScore).toBe(14);

    const rows = await readEvaluationScores(battle.roomId);
    expect(rows).toHaveLength(1);
    expect(rows[0].evaluator_team_id).toBeNull();
    expect(rows[0].host_id).toBe(battle.room.hostId);
    expect(rows[0].weight).toBe(2);
  });

  it('rejects self-evaluation with 403 SELF_EVALUATION — no row, no events', async () => {
    const { battle, teamA, tokenA } = await reachEvaluation();

    const res = await submitTeam(battle.room.code, tokenA, {
      targetTeamId: teamA,
      topicScore: 5,
      designScore: 5,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_EVALUATION');
    expect(await readEvaluationScores(battle.roomId)).toEqual([]);
    expect(evaluationEvents()).toEqual([]);
  });

  it('rejects a non-captain TEAM submission with 403 NOT_TEAM_CAPTAIN', async () => {
    const battle = await startBattle();
    await setRoomStage(battle.roomId, 'EVALUATION');
    const [teamA, teamB] = Object.keys(battle.tokenByTeam);
    // A non-captain joins teamA (Join is not stage-gated — shop-purchase 8.3).
    const carol = await joinRoom(app, battle.room.code, 'Carol');
    await joinTeam(app, battle.room.code, teamA, carol.token);
    events.length = 0;

    const res = await submitTeam(battle.room.code, carol.token, {
      targetTeamId: teamB,
      topicScore: 5,
      designScore: 5,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_TEAM_CAPTAIN');
  });

  it('rejects a cross-room target with 404 on BOTH the team and host paths', async () => {
    const { battle, tokenA } = await reachEvaluation();
    const other = await startBattle();
    const [otherTeam] = Object.keys(other.tokenByTeam);

    const teamRes = await submitTeam(battle.room.code, tokenA, {
      targetTeamId: otherTeam,
      topicScore: 5,
      designScore: 5,
    });
    expect(teamRes.status).toBe(404);
    expect(teamRes.body.error.code).toBe('TARGET_TEAM_NOT_FOUND');

    const hostRes = await submitHost(battle.room.code, battle.room.hostToken, {
      targetTeamId: otherTeam,
      topicScore: 5,
      designScore: 5,
    });
    expect(hostRes.status).toBe(404);
    expect(hostRes.body.error.code).toBe('TARGET_TEAM_NOT_FOUND');
  });

  it('rejects submitting outside EVALUATION with 409 UNEXPECTED_GAME_STAGE', async () => {
    // A fresh room is in LOBBY — the wrong stage; the gate fires before any
    // target/evaluator work, so a placeholder targetTeamId is fine.
    const room = await createRoom(app);

    const res = await submitHost(room.code, room.hostToken, {
      targetTeamId: '00000000-0000-4000-8000-000000000000',
      topicScore: 5,
      designScore: 5,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNEXPECTED_GAME_STAGE');
  });

  it('rejects a score out of the criterion range with 409 SCORE_OUT_OF_RANGE', async () => {
    const { battle, teamB, tokenA } = await reachEvaluation();

    const res = await submitTeam(battle.room.code, tokenA, {
      targetTeamId: teamB,
      topicScore: 11, // max is 10
      designScore: 5,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SCORE_OUT_OF_RANGE');
  });

  it('re-submitting before confirm UPDATES in place — one row, latest scores', async () => {
    const { battle, teamB, tokenA } = await reachEvaluation();

    await submitTeam(battle.room.code, tokenA, {
      targetTeamId: teamB,
      topicScore: 3,
      designScore: 3,
    });
    const second = await submitTeam(battle.room.code, tokenA, {
      targetTeamId: teamB,
      topicScore: 9,
      designScore: 1,
    });
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.score.totalScore).toBe(10);

    const teamRows = (await readEvaluationScores(battle.roomId)).filter(
      (row) => row.evaluator_type === 'TEAM',
    );
    expect(teamRows).toHaveLength(1); // updated, NOT a second insert
    expect(teamRows[0].total_score).toBe(10);
  });

  it('per-target confirm freezes the draft (confirmed_at set) and emits score-confirmed', async () => {
    const { battle, teamB, tokenA } = await reachEvaluation();
    await submitTeam(battle.room.code, tokenA, {
      targetTeamId: teamB,
      topicScore: 7,
      designScore: 5,
    });
    events.length = 0;

    const res = await confirmTeam(battle.room.code, tokenA, {
      targetTeamId: teamB,
    });
    expect(res.status).toBe(200);
    expect(res.body.confirmed).toHaveLength(1);
    expect(res.body.confirmed[0].confirmedAt).not.toBeNull();
    expect(eventNames()).toEqual([
      'server:evaluation:score-confirmed',
      'server:evaluation:progress-updated',
    ]);
    noNumericScore(events[0].payload);

    const rows = await readEvaluationScores(battle.roomId);
    expect(rows[0].confirmed_at).not.toBeNull();
  });

  it('rejects per-target confirm of a missing draft with 404 EVALUATION_NOT_FOUND', async () => {
    const { battle, teamB, tokenA } = await reachEvaluation();

    const res = await confirmTeam(battle.room.code, tokenA, {
      targetTeamId: teamB,
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('EVALUATION_NOT_FOUND');
  });

  it('rejects re-submitting a CONFIRMED score with 409 EVALUATION_ALREADY_CONFIRMED', async () => {
    const { battle, teamB, tokenA } = await reachEvaluation();
    await submitTeam(battle.room.code, tokenA, {
      targetTeamId: teamB,
      topicScore: 7,
      designScore: 5,
    });
    await confirmTeam(battle.room.code, tokenA, { targetTeamId: teamB });

    const res = await submitTeam(battle.room.code, tokenA, {
      targetTeamId: teamB,
      topicScore: 1,
      designScore: 1,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EVALUATION_ALREADY_CONFIRMED');
  });

  it('all-at-once host confirm freezes only the remaining drafts (⚠️D — no clinch, idempotent)', async () => {
    const { battle, teamA, teamB } = await reachEvaluation();
    const { code, hostToken } = {
      code: battle.room.code,
      hostToken: battle.room.hostToken,
    };
    await submitHost(code, hostToken, {
      targetTeamId: teamA,
      topicScore: 5,
      designScore: 5,
    });
    await submitHost(code, hostToken, {
      targetTeamId: teamB,
      topicScore: 6,
      designScore: 4,
    });
    // Confirm teamA per-target first, THEN all-at-once: the latter must SKIP the
    // already-confirmed teamA (no 409) and freeze only teamB.
    await confirmHost(code, hostToken, { targetTeamId: teamA });
    events.length = 0;

    const res = await confirmHost(code, hostToken, {});
    expect(res.status).toBe(200);
    expect(res.body.confirmed).toHaveLength(1);
    expect(res.body.confirmed[0].targetTeamId).toBe(teamB);

    const rows = await readEvaluationScores(battle.roomId);
    expect(rows.every((row) => row.confirmed_at !== null)).toBe(true);

    // Idempotent: a second all-at-once freezes nothing.
    const again = await confirmHost(code, hostToken, {});
    expect(again.status).toBe(200);
    expect(again.body.confirmed).toEqual([]);
  });
});

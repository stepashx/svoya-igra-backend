import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ShopTimerRegistry } from '../../src/game-session/application/timers';
import { FAST_SHOP_TIMER, sleep } from '../utils/battle-driver';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import {
  closeDbReadPool,
  readFinalResults,
  readRoomLifecycle,
  readTeamScores,
} from '../utils/db-read';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import {
  getBoard,
  getGameState,
  openQuestion,
  reviewAnswer,
  selectCell,
  submitAnswer,
} from '../utils/gameplay-client';
import {
  createRoom,
  createTeam,
  HOST_HEADER,
  joinRoom,
  listTopics,
  PLAYER_HEADER,
  selectTopic,
  setReady,
  startGame,
} from '../utils/lobby-client';
import {
  startPreparation,
  uploadPresentation,
  replacePresentation,
  getSubmissions,
} from '../utils/presentation-client';
import { closeShop, getShopRound } from '../utils/shop-client';

/**
 * ACCEPTANCE — the whole game backbone in ONE live run (Stage 12, Phase 2).
 *
 * Every existing e2e suite jumps into the stage it owns with a raw `setRoomStage`
 * / counter preset and exercises that slice; NONE plays a full game. This suite
 * closes that gap: it drives a room from LOBBY all the way to FINISHED using
 * ONLY real REST endpoints, so every stage edge fires from a genuine game action
 * (no `setRoomStage`, no `presetRoomCounters`, no `presetTeamScores`, no db
 * write of any kind). The db-read helpers are used purely as read-only
 * cross-checks of state the REST surface already exposes.
 *
 * The single deviation from production timing is a TESTABILITY override, not a
 * stage shortcut: `SHOP_TIMER_SECONDS`/`shopMin` default to 120s/60s, so the
 * five shop windows this game opens would cost 5+ minutes of real waiting. The
 * battle suites' `FAST_SHOP_TIMER` (2s window / 1s min-close) is swapped in
 * exactly as `shop-flow`/`shop-purchase` already do — it changes how long a shop
 * stays open, never which stage edge is taken (the shop still opens on the live
 * %6/exhausted review and still closes through the real host endpoint). The
 * answer (60s) and preparation (600s) timers keep their defaults — battle cycles
 * and uploads complete well within them.
 *
 * The FileStoragePort is the REAL MinIO adapter (no override): captain uploads
 * round-trip to the live bucket `db:seed` provisions, proving the upload seam
 * end to end.
 *
 * The full stage journey proven live:
 *   LOBBY → TEAM_SETUP → READY_CHECK → GAME_BOARD
 *     → (QUESTION_OPENED → ANSWER_REVIEW)×30 with SHOP at every 6th block
 *     → PRESENTATION_PREPARATION (final shop on the exhausted board)
 *     → PRESENTATION_DEFENSE → EVALUATION → RESULTS (+ status FINISHED).
 *
 * Three residual seams the Phase-1 audit left unproven line-by-line are checked
 * live here (see the inline ☑ markers):
 *   SEAM-1  the GET final_results adapter orders (place, teamId) the same as the
 *           in-memory POST reply — proven on a real TIE (the balanced board play
 *           gives both teams an equal earned score, symmetric evaluations give an
 *           equal final score, so both share place 1 and the teamId tie-break is
 *           actually exercised);
 *   SEAM-2  close-room vs a finished game is last-writer-wins recoverable — the
 *           deterministic boundary (a close after FINISHED is a clean 409, no
 *           corruption) is asserted; the non-deterministic concurrent race is
 *           noted, not forced;
 *   SEAM-3  a host reconnect in the MIDDLE of the defenses re-resolves the
 *           derived `currentPresenterTeamId` and the game plays on to EVALUATION.
 */
describe('Full game — acceptance (LOBBY → FINISHED, one live run) (e2e)', () => {
  let app: INestApplication;
  let events: CapturedEvent[];

  beforeAll(async () => {
    const e2e = await createE2EApp((builder) =>
      builder.overrideProvider(ShopTimerRegistry).useValue(FAST_SHOP_TIMER),
    );
    app = e2e.app;
    events = e2e.events;
  });

  afterAll(async () => {
    await app.close();
    await closeTruncatePool();
    await closeDbReadPool();
  });

  beforeEach(async () => {
    await truncateLobby();
    events.length = 0;
  });

  const http = () => request(app.getHttpServer());

  /** Local shapes for the few `body`/`payload` reads this suite asserts on. */
  interface BoardCell {
    id: string;
    state: string;
    points: number;
  }
  interface ScoreChangedPayload {
    teamId: string;
    delta: number;
    earnedScore: number;
  }
  interface LeaderboardEntry {
    teamId: string;
    teamName: string;
    earnedScore: number;
    presentationScoreRaw: number;
    latePenalty: number;
    presentationScoreFinal: number;
    finalScore: number;
    place: number;
  }

  const getStage = async (code: string): Promise<string> => {
    const res = await http().get(`/api/rooms/${code}/game/stage`);
    expect(res.status).toBe(200);
    return res.body.currentStage as string;
  };

  const stageNames = (): string[] =>
    events
      .filter((e) => e.event === 'server:game-session:game-stage-changed')
      .map((e) => (e.payload as { stage: string }).stage);

  /**
   * Pick the next cell so the two teams end with an EQUAL earned score. The
   * board seeds six cells of each cost (100/200/400/600/800); the active team
   * takes the highest cost it still owes toward a 3-of-each share, so with the
   * strict turn alternation each team ends on 3×(100+200+400+600+800)=6300. The
   * fallback (any available cell) keeps the game progressing even if the model
   * ever drifts — the explicit equal-earned assertion below would then surface
   * it rather than masking it.
   */
  const pickBalancedCell = (
    cells: BoardCell[],
    countByCost: Record<number, number>,
  ): BoardCell => {
    const available = cells.filter((cell) => cell.state === 'AVAILABLE');
    const owed = available.filter(
      (cell) => (countByCost[cell.points] ?? 0) < 3,
    );
    const pool = owed.length > 0 ? owed : available;
    return pool.reduce(
      (best, cell) => (cell.points > best.points ? cell : best),
      pool[0],
    );
  };

  it('plays a complete game through real stage transitions and finishes', async () => {
    const journey: string[] = [];

    // ─── 1. LOBBY → TEAM_SETUP → READY_CHECK → GAME_BOARD ──────────────────
    const room = await createRoom(app);
    journey.push(await getStage(room.code)); // LOBBY

    const alice = await joinRoom(app, room.code, 'Alice');
    const bob = await joinRoom(app, room.code, 'Bob');

    // The team creator becomes the captain (LOBBY → TEAM_SETUP on the first team).
    const reds = await createTeam(app, room.code, alice.token, 'Reds');
    const blues = await createTeam(app, room.code, bob.token, 'Blues');
    expect(reds.captainPlayerId).toBe(alice.id);
    expect(blues.captainPlayerId).toBe(bob.id);
    journey.push(await getStage(room.code)); // TEAM_SETUP

    // Reds picks a topic; Blues leaves it to auto-assignment (both real calls).
    const topics = await listTopics(app);
    await selectTopic(app, room.code, reds.id, alice.token, topics[0].id);

    // Both captains ready up → TEAM_SETUP → READY_CHECK.
    await setReady(app, room.code, reds.id, alice.token, true);
    await setReady(app, room.code, blues.id, bob.token, true);
    journey.push(await getStage(room.code)); // READY_CHECK

    // Host starts → READY_CHECK → GAME_BOARD, turn order assigned to both teams.
    const snapshot = await startGame(app, room.code, room.hostToken);
    expect(snapshot.room.currentStage).toBe('GAME_BOARD');
    const roomId = snapshot.room.id;
    const startedTeams = snapshot.teams;
    expect(startedTeams.every((t) => t.turnOrder !== null)).toBe(true);
    journey.push('GAME_BOARD');

    // The lobby transitions and headline events really fired room-wide.
    const lobbyStages = stageNames();
    expect(lobbyStages.indexOf('TEAM_SETUP')).toBeGreaterThanOrEqual(0);
    expect(lobbyStages.indexOf('TEAM_SETUP')).toBeLessThan(
      lobbyStages.indexOf('READY_CHECK'),
    );
    expect(lobbyStages.indexOf('READY_CHECK')).toBeLessThan(
      lobbyStages.indexOf('GAME_BOARD'),
    );
    const lobbyEvents = new Set(events.map((e) => e.event));
    expect(lobbyEvents).toContain('server:game-session:player-joined');
    expect(lobbyEvents).toContain('server:game-session:team-created');
    expect(lobbyEvents).toContain('server:game-session:game-started');
    expect(lobbyEvents).toContain('server:game-session:game-turn-changed');

    const captainByTeam: Record<string, string> = {
      [reds.id]: alice.token,
      [blues.id]: bob.token,
    };
    const earnedByTeam: Record<string, number> = {
      [reds.id]: 0,
      [blues.id]: 0,
    };
    const costsByTeam: Record<string, Record<number, number>> = {
      [reds.id]: {},
      [blues.id]: {},
    };

    // ─── 2. GAME_BOARD: 30 live battle cycles, SHOP fork at every 6th block ──
    let sawShop = false;
    let sawFinalShop = false;
    for (let q = 1; q <= 30; q += 1) {
      const state = await getGameState(app, room.code);
      expect(state.status).toBe(200);
      expect(state.body.room.currentStage).toBe('GAME_BOARD');
      const activeTeam = state.body.room.currentTeamId as string;
      const captain = captainByTeam[activeTeam];
      expect(captain).toBeDefined();

      const board = await getBoard(app, room.code);
      expect(board.status).toBe(200);
      const cell = pickBalancedCell(
        board.body.cells as BoardCell[],
        costsByTeam[activeTeam],
      );

      // select → open (GAME_BOARD → QUESTION_OPENED) → answer (→ ANSWER_REVIEW)
      expect((await selectCell(app, room.code, captain, cell.id)).status).toBe(
        200,
      );
      expect(
        (await openQuestion(app, room.code, room.hostToken, cell.id)).status,
      ).toBe(200);
      const answered = await submitAnswer(app, room.code, captain, 'answer');
      expect(answered.status).toBe(200);
      expect(answered.body.stage).toBe('ANSWER_REVIEW');

      // Isolate the review's broadcasts so score-changed is unambiguous.
      events.length = 0;
      const reviewed = await reviewAnswer(app, room.code, room.hostToken, true);
      expect(reviewed.status).toBe(200);

      // ☑ score-changed credits the OPENING team by exactly the cell's cost.
      const scoreChanged = events.find(
        (e) => e.event === 'server:gameplay:score-changed',
      );
      expect(scoreChanged).toBeDefined();
      const scorePayload = scoreChanged?.payload as ScoreChangedPayload;
      expect(scorePayload.teamId).toBe(activeTeam);
      expect(scorePayload.delta).toBe(cell.points);
      earnedByTeam[activeTeam] += cell.points;
      costsByTeam[activeTeam][cell.points] =
        (costsByTeam[activeTeam][cell.points] ?? 0) + 1;

      // SHOP fork: a regular shop on the 6/12/18/24th block, the FINAL shop on
      // the 30th (exhausted board). Closed through the real host endpoint.
      if (q % 6 === 0) {
        sawShop = true;
        const inShop = await getGameState(app, room.code);
        expect(inShop.body.room.currentStage).toBe('SHOP');
        const round = await getShopRound(app, room.code);
        expect(round.status).toBe(200);
        expect(round.body.currentStage).toBe('SHOP');
        expect(round.body.isFinalShop).toBe(q === 30);

        await sleep(1_100); // past the 1s min-close (FAST_SHOP_TIMER)
        const closed = await closeShop(app, room.code, room.hostToken);
        expect(closed.status).toBe(200);
        expect(closed.body.currentStage).toBe(
          q === 30 ? 'PRESENTATION_PREPARATION' : 'GAME_BOARD',
        );
        if (q === 30) sawFinalShop = true;
      }
    }

    expect(sawShop).toBe(true);
    expect(sawFinalShop).toBe(true);
    journey.push(await getStage(room.code)); // PRESENTATION_PREPARATION

    // Balanced play → equal earned score; the event tally matches the persisted
    // §14.7 score (events ↔ DB), the first link of the end-to-end score chain.
    expect(earnedByTeam[reds.id]).toBe(6300);
    expect(earnedByTeam[blues.id]).toBe(6300);
    expect((await readTeamScores(reds.id))?.earned_score).toBe(6300);
    expect((await readTeamScores(blues.id))?.earned_score).toBe(6300);

    // ─── 3. PRESENTATION_PREPARATION: host opens prep, captains upload ──────
    const prep = await startPreparation(app, room.code, room.hostToken);
    expect(prep.status).toBe(200);
    expect(prep.body.status).toBe('RUNNING');

    const pdf = {
      buffer: Buffer.from('%PDF-1.4 acceptance presentation bytes'),
      filename: 'deck.pdf',
      contentType: 'application/pdf',
    };
    for (const [teamId, token] of Object.entries(captainByTeam)) {
      const uploaded = await uploadPresentation(app, room.code, token, pdf);
      expect(uploaded.status).toBe(200);
      expect(uploaded.body).toMatchObject({
        teamId,
        status: 'UPLOADED',
        isLate: false,
        latePenalty: 0,
      });
      expect(typeof uploaded.body.publicUrl).toBe('string');
    }
    // A captain replaces in place (PUT) — still on time, same row.
    const replaced = await replacePresentation(app, room.code, alice.token, {
      ...pdf,
      filename: 'deck-v2.pdf',
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.isCreate).toBe(false);

    const submissions = await getSubmissions(app, room.code);
    expect(submissions.status).toBe(200);
    expect(submissions.body).toHaveLength(2);

    // ─── 4. PRESENTATION_DEFENSE: open, advance presenters, SEAM-3 reconnect ─
    const started = await http()
      .post(`/api/rooms/${room.code}/defense/start`)
      .set(HOST_HEADER, room.hostToken);
    expect(started.status).toBe(200);
    expect(started.body.currentStage).toBe('PRESENTATION_DEFENSE');
    const order = started.body.order as string[];
    expect(order).toHaveLength(2);
    expect(started.body.currentPresenterTeamId).toBe(order[0]);
    journey.push('PRESENTATION_DEFENSE');

    // Finish the first presenter → advance to the second, still in DEFENSE.
    const firstDone = await http()
      .post(`/api/rooms/${room.code}/defense/finish-presenter`)
      .set(HOST_HEADER, room.hostToken);
    expect(firstDone.status).toBe(200);
    expect(firstDone.body).toMatchObject({
      currentStage: 'PRESENTATION_DEFENSE',
      currentPresenterTeamId: order[1],
      finished: false,
    });

    // ☑ SEAM-3: the host reconnects MID-defense (one presenter still to go). The
    // defense state is fully derived (currentPresenterTeamId = the room's active
    // pointer), so the reconnect must re-resolve it unchanged and the game plays
    // on — not reset to the first presenter, not stuck.
    const reconnect = await http()
      .post(`/api/rooms/${room.code}/host/reconnect`)
      .set(HOST_HEADER, room.hostToken);
    expect(reconnect.status).toBe(200);
    expect(reconnect.body.room.currentStage).toBe('PRESENTATION_DEFENSE');
    const stateAfter = await http().get(
      `/api/rooms/${room.code}/defense/state`,
    );
    expect(stateAfter.status).toBe(200);
    expect(stateAfter.body.currentPresenterTeamId).toBe(order[1]);
    expect(stateAfter.body.order).toEqual(order);

    // Finish the LAST presenter → the room moves itself on to EVALUATION.
    const lastDone = await http()
      .post(`/api/rooms/${room.code}/defense/finish-presenter`)
      .set(HOST_HEADER, room.hostToken);
    expect(lastDone.status).toBe(200);
    expect(lastDone.body).toMatchObject({
      currentStage: 'EVALUATION',
      currentPresenterTeamId: null,
      finished: true,
    });
    journey.push(await getStage(room.code)); // EVALUATION

    // ─── 5. EVALUATION: captains + host score, then confirm ─────────────────
    const submitTeamScore = (token: string, body: object) =>
      http()
        .post(`/api/rooms/${room.code}/evaluation/team`)
        .set(PLAYER_HEADER, token)
        .send(body);
    const submitHostScore = (body: object) =>
      http()
        .post(`/api/rooms/${room.code}/evaluation/host`)
        .set(HOST_HEADER, room.hostToken)
        .send(body);

    // Symmetric totals (each row totals 6): every target's weighted raw score is
    // (1·6 + 2·6)/3 = 6, equal for both teams — the tie that makes SEAM-1 bite.
    await submitTeamScore(alice.token, {
      targetTeamId: blues.id,
      topicScore: 3,
      designScore: 3,
    });
    await submitTeamScore(bob.token, {
      targetTeamId: reds.id,
      topicScore: 3,
      designScore: 3,
    });
    await submitHostScore({
      targetTeamId: reds.id,
      topicScore: 3,
      designScore: 3,
    });
    await submitHostScore({
      targetTeamId: blues.id,
      topicScore: 3,
      designScore: 3,
    });

    await http()
      .post(`/api/rooms/${room.code}/evaluation/team/confirm`)
      .set(PLAYER_HEADER, alice.token)
      .send({});
    await http()
      .post(`/api/rooms/${room.code}/evaluation/team/confirm`)
      .set(PLAYER_HEADER, bob.token)
      .send({});
    await http()
      .post(`/api/rooms/${room.code}/evaluation/host/confirm`)
      .set(HOST_HEADER, room.hostToken)
      .send({});

    // The N² tally is complete with the two ready participants → the gate is
    // REACHABLE WITHOUT force (the Stage 12 liveness fix: teamCount counts
    // non-null turnOrder, not captains).
    const progress = await http().get(
      `/api/rooms/${room.code}/evaluation/progress`,
    );
    expect(progress.status).toBe(200);
    expect(progress.body.teamCount).toBe(2);
    expect(progress.body.complete).toBe(true);

    // ─── 6. RESULTS + FINISH: host calculates WITHOUT force ─────────────────
    events.length = 0; // isolate the after-commit completed/results-calculated
    const results = await http()
      .post(`/api/rooms/${room.code}/evaluation/results`)
      .set(HOST_HEADER, room.hostToken)
      .send({}); // ☑ FIX: no { force: true }
    expect(results.status).toBe(200);
    journey.push(await getStage(room.code)); // RESULTS

    const leaderboard = results.body.leaderboard as LeaderboardEntry[];
    expect(leaderboard).toHaveLength(2);

    // The irreversible finish broadcasts fired room-wide, after commit, in order.
    expect(
      events
        .filter(
          (e) =>
            e.event === 'server:evaluation:completed' ||
            e.event === 'server:evaluation:results-calculated',
        )
        .map((e) => e.event),
    ).toEqual([
      'server:evaluation:completed',
      'server:evaluation:results-calculated',
    ]);

    // ─── 7. Final assertions: full path, finish, scores, the three seams ────

    // The game travelled the whole canonical stage path on real transitions.
    expect(journey).toEqual([
      'LOBBY',
      'TEAM_SETUP',
      'READY_CHECK',
      'GAME_BOARD',
      'PRESENTATION_PREPARATION',
      'PRESENTATION_DEFENSE',
      'EVALUATION',
      'RESULTS',
    ]);

    // The room really finished (RESULTS + FINISHED + finishedAt), via REST and DB.
    const status = await http().get(`/api/rooms/${room.code}/status`);
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      status: 'FINISHED',
      currentStage: 'RESULTS',
    });
    const lifecycle = await readRoomLifecycle(roomId);
    expect(lifecycle?.status).toBe('FINISHED');
    expect(lifecycle?.current_stage).toBe('RESULTS');
    expect(lifecycle?.finished_at).not.toBeNull();

    // ☑ End-to-end scores: leaderboard earnedScore == the live event tally, and
    // finalScore == earnedScore × presentationScoreFinal (= max(0, raw − penalty)).
    for (const entry of leaderboard) {
      expect(entry.earnedScore).toBe(earnedByTeam[entry.teamId]);
      expect(entry.earnedScore).toBe(6300);
      expect(entry.presentationScoreRaw).toBe(6);
      expect(entry.latePenalty).toBe(0);
      expect(entry.presentationScoreFinal).toBe(6); // max(0, 6 − 0)
      expect(entry.finalScore).toBe(6300 * 6); // earned × presFinal = 37800
    }

    // ☑ SEAM-1: a real tie — equal earned (balanced board) × equal presentation
    // → equal finalScore → both DENSE place 1, the teamId tie-break exercised.
    expect(leaderboard.map((e) => e.place)).toEqual([1, 1]);
    const postOrder = leaderboard.map((e) => e.teamId);
    // In-memory tie-break is teamId ASC, so the POST order is sorted ascending…
    expect(postOrder).toEqual([...postOrder].sort());
    // …and the GET adapter (ORDER BY place, teamId) must return the SAME order,
    // stably, across repeated reads (in-memory projection == adapter projection).
    const reads = await Promise.all([
      http().get(`/api/rooms/${room.code}/evaluation/results`),
      http().get(`/api/rooms/${room.code}/evaluation/results`),
      http().get(`/api/rooms/${room.code}/evaluation/results`),
    ]);
    for (const read of reads) {
      expect(read.status).toBe(200);
      expect(read.body.leaderboard).toEqual(leaderboard);
    }
    // The persisted rows agree with both surfaces (read-only cross-check).
    const persisted = await readFinalResults(roomId);
    expect(persisted.map((r) => r.place)).toEqual([1, 1]);
    expect(persisted.map((r) => r.team_id)).toEqual(postOrder);
    expect(persisted.every((r) => r.final_score === 6300 * 6)).toBe(true);

    // ☑ SEAM-2: last-writer-wins recoverable boundary — once the game is
    // FINISHED, a host close is cleanly rejected (ROOM_NOT_ACTIVE, 409): the
    // finish "won", no corruption, the results read still serves. (The truly
    // CONCURRENT close/calculate race is non-deterministic and intentionally not
    // asserted on exact status here — this is the deterministic boundary of it.)
    const lateClose = await http()
      .post(`/api/rooms/${room.code}/close`)
      .set(HOST_HEADER, room.hostToken);
    expect(lateClose.status).toBe(409);
    expect(lateClose.body.error.code).toBe('ROOM_NOT_ACTIVE');
    const afterClose = await http().get(
      `/api/rooms/${room.code}/evaluation/results`,
    );
    expect(afterClose.status).toBe(200);
    expect(afterClose.body.leaderboard).toHaveLength(2);
  }, 180_000);
});

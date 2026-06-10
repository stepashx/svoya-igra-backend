import { INestApplication } from '@nestjs/common';
import { AppConfigService } from '../../src/config/app-config.service';
import { AnswerTimerRegistry } from '../../src/game-session/application/timers';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import {
  createRoom,
  createTeam,
  joinRoom,
  setReady,
  startGame,
} from '../utils/lobby-client';
import {
  advance,
  getBoard,
  getCurrentAnswer,
  getCurrentQuestion,
  getCurrentQuestionForHost,
  getGameState,
  getTimer,
  openQuestion,
  rejectSelection,
  reviewAnswer,
  selectCell,
  submitAnswer,
} from '../utils/gameplay-client';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** A 1-second answer timer so the timeout path is exercisable in real time. */
const ONE_SECOND_TIMER = new AnswerTimerRegistry({
  timers: { answerSeconds: 1 },
} as unknown as AppConfigService);

/**
 * Full battle cycle over real Postgres (sub-stage 6.2a). The suite overrides the
 * AnswerTimerRegistry with a 1-second one (the ANSWER_TIMER_SECONDS env cannot be
 * overridden per-suite — ConfigModule.forRoot evaluates at AppModule import time,
 * before any in-test mutation; a DI override is deterministic and scoped here).
 */
describe('Battle cycle (e2e)', () => {
  let app: INestApplication;
  let events: CapturedEvent[];

  beforeAll(async () => {
    const e2e = await createE2EApp((builder) =>
      builder.overrideProvider(AnswerTimerRegistry).useValue(ONE_SECOND_TIMER),
    );
    app = e2e.app;
    events = e2e.events;
  });

  afterAll(async () => {
    await app.close();
    await closeTruncatePool();
  });

  beforeEach(async () => {
    await truncateLobby();
    events.length = 0;
  });

  /** Drive the lobby to a started game with two ready teams and resolve roles. */
  const startBattle = async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');
    const bob = await joinRoom(app, room.code, 'Bob');
    const reds = await createTeam(app, room.code, alice.token, 'Reds');
    const blues = await createTeam(app, room.code, bob.token, 'Blues');
    await setReady(app, room.code, reds.id, alice.token, true);
    await setReady(app, room.code, blues.id, bob.token, true);
    const snapshot = await startGame(app, room.code, room.hostToken);

    expect(snapshot.room.currentStage).toBe('GAME_BOARD');
    expect(snapshot.room.currentTeamId).not.toBeNull();
    const activeTeamId = snapshot.room.currentTeamId as string;
    const tokenByTeam: Record<string, string> = {
      [reds.id]: alice.token,
      [blues.id]: bob.token,
    };
    const activeCaptainToken = tokenByTeam[activeTeamId];
    const otherCaptainToken =
      activeTeamId === reds.id ? bob.token : alice.token;

    return { room, activeTeamId, activeCaptainToken, otherCaptainToken };
  };

  /** Fetch the board and return the first cell's id. */
  const firstCellId = async (code: string): Promise<string> => {
    const res = await getBoard(app, code);
    expect(res.status).toBe(200);
    return res.body.cells[0].id;
  };

  it('plays a full accepted round and broadcasts the §16.4 events in order', async () => {
    const { room, activeTeamId, activeCaptainToken } = await startBattle();
    events.length = 0; // focus on battle events only

    const board = await getBoard(app, room.code);
    expect(board.status).toBe(200);
    expect(board.body.cells).toHaveLength(30);
    expect(
      board.body.cells.every(
        (cell: { state: string }) => cell.state === 'AVAILABLE',
      ),
    ).toBe(true);
    const cellId = board.body.cells[0].id;

    // Captain of the active team selects a cell.
    const selected = await selectCell(
      app,
      room.code,
      activeCaptainToken,
      cellId,
    );
    expect(selected.status).toBe(200);
    expect(selected.body.state).toBe('SELECTED');

    // Host opens it: host view has the answer; the timer is running.
    const opened = await openQuestion(app, room.code, room.hostToken, cellId);
    expect(opened.status).toBe(200);
    expect(opened.body.question.correctAnswer).toBeDefined();
    expect(opened.body.timer.status).toBe('RUNNING');

    // Captain answers immediately (well within the 1s window).
    const answered = await submitAnswer(
      app,
      room.code,
      activeCaptainToken,
      'My answer',
    );
    expect(answered.status).toBe(200);
    expect(answered.body.stage).toBe('ANSWER_REVIEW');
    expect(answered.body.question.correctAnswer).toBeUndefined();

    // Secrecy while OPENED: room view omits the answer, host view includes it.
    const roomQuestion = await getCurrentQuestion(app, room.code);
    expect(roomQuestion.status).toBe(200);
    expect(roomQuestion.body.text).toBeDefined();
    expect(roomQuestion.body.correctAnswer).toBeUndefined();
    const hostQuestion = await getCurrentQuestionForHost(
      app,
      room.code,
      room.hostToken,
    );
    expect(hostQuestion.status).toBe(200);
    expect(hostQuestion.body.correctAnswer).toBeDefined();

    // Host accepts → cell BLOCKED to the opener; board returned.
    const reviewed = await reviewAnswer(app, room.code, room.hostToken, true);
    expect(reviewed.status).toBe(200);
    const blocked = reviewed.body.cells.find(
      (cell: { id: string }) => cell.id === cellId,
    );
    expect(blocked.state).toBe('BLOCKED');
    expect(blocked.answeredByTeamId).toBe(activeTeamId);

    // Room state: one blocked question; the turn moved on.
    const state = await getGameState(app, room.code);
    expect(state.status).toBe(200);
    expect(state.body.room.blockedQuestionsCount).toBe(1);
    expect(state.body.room.currentTeamId).not.toBe(activeTeamId);

    // Recorder: question-opened never carried the correct answer.
    const openedEvent = events.find(
      (e) => e.event === 'server:gameplay:question-opened',
    );
    expect(openedEvent).toBeDefined();
    const openedPayload = openedEvent?.payload as {
      question: Record<string, unknown>;
    };
    expect(openedPayload.question).toHaveProperty('text');
    expect(openedPayload.question).not.toHaveProperty('correctAnswer');

    // Recorder: the §16.4 room-wide sequence fired in order. The recorder sees
    // emitToRoom only — cell-selection-requested is host-socket-only since
    // 6.2b and must never appear here (see host-delivery.e2e-spec for its
    // positive path).
    const names = events.map((e) => e.event);
    const at = (name: string): number => names.indexOf(name);
    expect(names).not.toContain('server:gameplay:cell-selection-requested');
    expect(
      at('server:gameplay:cell-selection-approved'),
    ).toBeGreaterThanOrEqual(0);
    expect(at('server:gameplay:question-opened')).toBeGreaterThan(
      at('server:gameplay:cell-selection-approved'),
    );
    expect(at('server:gameplay:question-timer-started')).toBeGreaterThan(
      at('server:gameplay:question-opened'),
    );
    expect(at('server:gameplay:answer-submitted')).toBeGreaterThan(
      at('server:gameplay:question-opened'),
    );
    expect(at('server:gameplay:answer-accepted')).toBeGreaterThan(
      at('server:gameplay:answer-submitted'),
    );
    expect(at('server:gameplay:cell-blocked')).toBeGreaterThan(
      at('server:gameplay:answer-accepted'),
    );
    expect(at('server:game-session:game-turn-changed')).toBeGreaterThan(
      at('server:gameplay:answer-accepted'),
    );
    expect(at('server:gameplay:board-state-updated')).toBeGreaterThan(
      at('server:gameplay:cell-blocked'),
    );
    // Superseded / deferred events are never emitted in Stage 6.
    expect(names).not.toContain('server:gameplay:score-changed');
    expect(names).not.toContain('server:gameplay:cell-selected');
  });

  it('blocks the cell on a rejected answer with no answerer', async () => {
    const { room, activeCaptainToken } = await startBattle();
    const cellId = await firstCellId(room.code);
    await selectCell(app, room.code, activeCaptainToken, cellId);
    await openQuestion(app, room.code, room.hostToken, cellId);
    await submitAnswer(app, room.code, activeCaptainToken);

    const reviewed = await reviewAnswer(app, room.code, room.hostToken, false);
    expect(reviewed.status).toBe(200);
    const blocked = reviewed.body.cells.find(
      (cell: { id: string }) => cell.id === cellId,
    );
    expect(blocked.state).toBe('BLOCKED');
    expect(blocked.answeredByTeamId).toBeNull();
  });

  describe('answer secrecy', () => {
    it('hides the answer endpoint behind the host guard', async () => {
      const { room, activeCaptainToken } = await startBattle();
      const cellId = await firstCellId(room.code);
      await selectCell(app, room.code, activeCaptainToken, cellId);
      await openQuestion(app, room.code, room.hostToken, cellId);

      const noToken = await getCurrentAnswer(app, room.code);
      expect(noToken.status).toBe(403);

      const withToken = await getCurrentAnswer(app, room.code, room.hostToken);
      expect(withToken.status).toBe(200);
      expect(typeof withToken.body.correctAnswer).toBe('string');
    });
  });

  describe('enforcement', () => {
    it('forbids selecting when not the active-team captain (403)', async () => {
      const { room, otherCaptainToken } = await startBattle();
      const cellId = await firstCellId(room.code);
      const res = await selectCell(app, room.code, otherCaptainToken, cellId);
      expect(res.status).toBe(403);
    });

    it('rejects a second selection while one is in progress (409)', async () => {
      const { room, activeCaptainToken } = await startBattle();
      const board = await getBoard(app, room.code);
      const [first, second] = board.body.cells;
      const ok = await selectCell(app, room.code, activeCaptainToken, first.id);
      expect(ok.status).toBe(200);
      const conflict = await selectCell(
        app,
        room.code,
        activeCaptainToken,
        second.id,
      );
      expect(conflict.status).toBe(409);
    });

    it('rejects opening before a cell is selected (409)', async () => {
      const { room } = await startBattle();
      const cellId = await firstCellId(room.code);
      const res = await openQuestion(app, room.code, room.hostToken, cellId);
      expect(res.status).toBe(409);
    });

    it('rejects submitting before a question is opened (409)', async () => {
      const { room, activeCaptainToken } = await startBattle();
      const res = await submitAnswer(app, room.code, activeCaptainToken, 'x');
      expect(res.status).toBe(409);
    });

    it('rejects reviewing before an answer is submitted (409)', async () => {
      const { room, activeCaptainToken } = await startBattle();
      const cellId = await firstCellId(room.code);
      await selectCell(app, room.code, activeCaptainToken, cellId);
      await openQuestion(app, room.code, room.hostToken, cellId);
      const res = await reviewAnswer(app, room.code, room.hostToken, true);
      expect(res.status).toBe(409);
    });

    it('forbids host actions without a valid host token (403)', async () => {
      const { room, activeCaptainToken } = await startBattle();
      const cellId = await firstCellId(room.code);
      await selectCell(app, room.code, activeCaptainToken, cellId);

      const wrong = 'not-the-host-token';
      expect((await openQuestion(app, room.code, wrong, cellId)).status).toBe(
        403,
      );
      expect(
        (await rejectSelection(app, room.code, wrong, cellId)).status,
      ).toBe(403);
      expect((await reviewAnswer(app, room.code, wrong, true)).status).toBe(
        403,
      );
    });
  });

  describe('answer timer', () => {
    it('runs, expires, blocks a late answer, and bridges via advance', async () => {
      const { room, activeCaptainToken } = await startBattle();
      const cellId = await firstCellId(room.code);
      await selectCell(app, room.code, activeCaptainToken, cellId);
      await openQuestion(app, room.code, room.hostToken, cellId);

      // Timer is RUNNING with endsAt in the future.
      const running = await getTimer(app, room.code);
      expect(running.status).toBe(200);
      expect(running.body.status).toBe('RUNNING');
      expect(new Date(running.body.endsAt).getTime()).toBeGreaterThan(
        Date.now(),
      );

      // Wait past the 1s window → a late answer is rejected (409).
      await sleep(1_100);
      const expired = await getTimer(app, room.code);
      expect(expired.body.status).toBe('EXPIRED');
      const late = await submitAnswer(app, room.code, activeCaptainToken, 'x');
      expect(late.status).toBe(409);

      // Host bridges the timeout → ANSWER_REVIEW + question-timer-ended.
      events.length = 0;
      const advanced = await advance(app, room.code, room.hostToken);
      expect(advanced.status).toBe(200);
      expect(advanced.body.currentStage).toBe('ANSWER_REVIEW');
      const names = events.map((e) => e.event);
      expect(names).toContain('server:gameplay:question-timer-ended');
    });
  });
});

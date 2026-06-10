import { INestApplication } from '@nestjs/common';
import { Socket } from 'socket.io-client';
import { RoomStateResponseDto } from '../../src/game-session/presentation/dto/response';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import {
  createRoom,
  createTeam,
  joinRoom,
  setReady,
  startGame,
} from '../utils/lobby-client';
import {
  getActiveCell,
  getBoard,
  getCurrentAnswer,
  openQuestion,
  reviewAnswer,
  selectCell,
  submitAnswer,
} from '../utils/gameplay-client';
import {
  awaitConnect,
  awaitEvent,
  closeSockets,
  connectRealtime,
  expectNoEvent,
  settle,
} from '../utils/realtime-client';
import { createRealtimeE2EApp } from '../utils/realtime-e2e-app';

const ROOM_STATE = 'server:game-session:room-state';
const CELL_SELECTION_REQUESTED = 'server:gameplay:cell-selection-requested';
const CELL_SELECTION_APPROVED = 'server:gameplay:cell-selection-approved';
const QUESTION_OPENED = 'server:gameplay:question-opened';
const QUESTION_TIMER_STARTED = 'server:gameplay:question-timer-started';
const ANSWER_SUBMITTED = 'server:gameplay:answer-submitted';
const ANSWER_ACCEPTED = 'server:gameplay:answer-accepted';
const CELL_BLOCKED = 'server:gameplay:cell-blocked';
const GAME_TURN_CHANGED = 'server:game-session:game-turn-changed';
const BOARD_STATE_UPDATED = 'server:gameplay:board-state-updated';
const ANSWER_SHOWN_TO_HOST =
  'server:gameplay:question-correct-answer-shown-to-host';

interface CellSelectionRequested {
  roomId: string;
  cell: { id: string; state: string };
}
interface QuestionOpened {
  roomId: string;
  cellId: string;
  question: Record<string, unknown>;
}
interface AnswerShownToHost {
  roomId: string;
  cellId: string;
  correctAnswer: string;
}

/**
 * Host-socket delivery over live Socket.IO + real Postgres (sub-stage 6.2b):
 * `cell-selection-requested` and the reveal-gated
 * `question-correct-answer-shown-to-host` reach every host tab and never a
 * player socket, while the room-wide battle events keep reaching everyone.
 * No timer override needed — every review happens well inside the 60s window.
 */
describe('Host-socket delivery (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let wsPath: string;
  const open: Socket[] = [];

  const connect = (reconnectToken: string): Socket => {
    const socket = connectRealtime(port, { path: wsPath, reconnectToken });
    open.push(socket);
    return socket;
  };

  /** Connect + finished handshake (joined the room group); returns room-state. */
  const connectAndJoin = async (
    reconnectToken: string,
  ): Promise<{ socket: Socket; state: RoomStateResponseDto }> => {
    const socket = connect(reconnectToken);
    const state = awaitEvent<RoomStateResponseDto>(socket, ROOM_STATE);
    await awaitConnect(socket);
    return { socket, state: await state };
  };

  beforeAll(async () => {
    const e2e = await createRealtimeE2EApp();
    app = e2e.app;
    port = e2e.port;
    wsPath = e2e.wsPath;
  });

  afterAll(async () => {
    closeSockets(...open);
    await settle();
    await app.close();
    await closeTruncatePool();
  });

  beforeEach(async () => {
    await truncateLobby();
  });

  afterEach(async () => {
    closeSockets(...open);
    open.length = 0;
    await settle();
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
    const activeTeamId = snapshot.room.currentTeamId as string;
    const activeCaptainToken =
      activeTeamId === reds.id ? alice.token : bob.token;

    return { room, activeCaptainToken };
  };

  /** Fetch the board and return the first cell's id. */
  const firstCellId = async (code: string): Promise<string> => {
    const res = await getBoard(app, code);
    expect(res.status).toBe(200);
    return res.body.cells[0].id;
  };

  // (1)–(4): one full battle cycle with both host tabs and the captain online.
  it('delivers the host-only events to every host tab and the room-wide ones to all', async () => {
    const { room, activeCaptainToken } = await startBattle();
    const hostA = await connectAndJoin(room.hostToken);
    const hostB = await connectAndJoin(room.hostToken); // second host tab
    const captain = await connectAndJoin(activeCaptainToken);
    const roomId = captain.state.room.id;
    const cellId = await firstCellId(room.code);

    // (1) Captain selects over REST → the prompt reaches BOTH host tabs and
    // never the captain's socket (negative window anchored on the host awaits).
    const requestedA = awaitEvent<CellSelectionRequested>(
      hostA.socket,
      CELL_SELECTION_REQUESTED,
    );
    const requestedB = awaitEvent<CellSelectionRequested>(
      hostB.socket,
      CELL_SELECTION_REQUESTED,
    );
    const captainNotPrompted = expectNoEvent(
      captain.socket,
      CELL_SELECTION_REQUESTED,
    );
    const selected = await selectCell(
      app,
      room.code,
      activeCaptainToken,
      cellId,
    );
    expect(selected.status).toBe(200);
    const [promptA, promptB] = await Promise.all([requestedA, requestedB]);
    await captainNotPrompted;
    expect(promptA).toMatchObject({
      roomId,
      cell: expect.objectContaining({ id: cellId, state: 'SELECTED' }),
    });
    expect(promptB).toEqual(promptA);

    // (2) Host opens → approved/opened/timer-started are room-wide: they reach
    // the captain AND the host; the room payload never carries the answer.
    const roomWideOpen = [
      awaitEvent(captain.socket, CELL_SELECTION_APPROVED),
      awaitEvent(captain.socket, QUESTION_TIMER_STARTED),
      awaitEvent(hostA.socket, CELL_SELECTION_APPROVED),
      awaitEvent(hostA.socket, QUESTION_OPENED),
      awaitEvent(hostA.socket, QUESTION_TIMER_STARTED),
    ];
    const openedForCaptain = awaitEvent<QuestionOpened>(
      captain.socket,
      QUESTION_OPENED,
    );
    const opened = await openQuestion(app, room.code, room.hostToken, cellId);
    expect(opened.status).toBe(200);
    await Promise.all(roomWideOpen);
    const openedPayload = await openedForCaptain;
    expect(openedPayload.question).toHaveProperty('text');
    expect(openedPayload.question).not.toHaveProperty('correctAnswer');

    // (3) Captain submits → answer-submitted is room-wide.
    const submittedToCaptain = awaitEvent(captain.socket, ANSWER_SUBMITTED);
    const submittedToHost = awaitEvent(hostA.socket, ANSWER_SUBMITTED);
    const submitted = await submitAnswer(
      app,
      room.code,
      activeCaptainToken,
      'My answer',
    );
    expect(submitted.status).toBe(200);
    await Promise.all([submittedToCaptain, submittedToHost]);

    // (4) Review with revealAnswer → the answer goes to BOTH host tabs only;
    // the room-wide review events still reach the captain. The REST answer
    // (fetched BEFORE the review) is the value the socket must carry.
    const answerRes = await getCurrentAnswer(app, room.code, room.hostToken);
    expect(answerRes.status).toBe(200);
    const expectedAnswer = answerRes.body.correctAnswer as string;
    expect(typeof expectedAnswer).toBe('string');

    const shownA = awaitEvent<AnswerShownToHost>(
      hostA.socket,
      ANSWER_SHOWN_TO_HOST,
    );
    const shownB = awaitEvent<AnswerShownToHost>(
      hostB.socket,
      ANSWER_SHOWN_TO_HOST,
    );
    const captainNotShown = expectNoEvent(captain.socket, ANSWER_SHOWN_TO_HOST);
    const roomWideReview = [
      awaitEvent(captain.socket, ANSWER_ACCEPTED),
      awaitEvent(captain.socket, CELL_BLOCKED),
      awaitEvent(captain.socket, GAME_TURN_CHANGED),
      awaitEvent(captain.socket, BOARD_STATE_UPDATED),
    ];
    const reviewed = await reviewAnswer(
      app,
      room.code,
      room.hostToken,
      true,
      true,
    );
    expect(reviewed.status).toBe(200);
    const [shownPayloadA, shownPayloadB] = await Promise.all([shownA, shownB]);
    await Promise.all(roomWideReview);
    await captainNotShown;
    expect(shownPayloadA).toEqual({
      roomId,
      cellId,
      correctAnswer: expectedAnswer,
    });
    expect(shownPayloadB).toEqual(shownPayloadA);
  });

  // (5) Reveal gating: a review WITHOUT revealAnswer emits no host answer
  // event — anchored on the room-wide answer-accepted arriving at the SAME
  // host socket.
  it('does not emit the answer to the host when revealAnswer is omitted', async () => {
    const { room, activeCaptainToken } = await startBattle();
    const hostA = await connectAndJoin(room.hostToken);
    const cellId = await firstCellId(room.code);

    expect(
      (await selectCell(app, room.code, activeCaptainToken, cellId)).status,
    ).toBe(200);
    expect(
      (await openQuestion(app, room.code, room.hostToken, cellId)).status,
    ).toBe(200);
    expect(
      (await submitAnswer(app, room.code, activeCaptainToken, 'x')).status,
    ).toBe(200);

    const acceptedOnHost = awaitEvent(hostA.socket, ANSWER_ACCEPTED);
    const noAnswerShown = expectNoEvent(hostA.socket, ANSWER_SHOWN_TO_HOST, {
      windowMs: 600,
    });
    const reviewed = await reviewAnswer(app, room.code, room.hostToken, true);
    expect(reviewed.status).toBe(200);
    await acceptedOnHost;
    await noAnswerShown;
  });

  // (6) No-op without host sockets: both host tabs are gone — the select still
  // succeeds over REST and nobody (in particular not the captain) receives the
  // host prompt.
  it('select without any live host socket is a silent no-op for delivery', async () => {
    const { room, activeCaptainToken } = await startBattle();
    const hostA = await connectAndJoin(room.hostToken);
    const hostB = await connectAndJoin(room.hostToken);
    const captain = await connectAndJoin(activeCaptainToken);

    closeSockets(hostA.socket, hostB.socket);
    await settle();

    const cellId = await firstCellId(room.code);
    const captainNotPrompted = expectNoEvent(
      captain.socket,
      CELL_SELECTION_REQUESTED,
      { windowMs: 600 },
    );
    const selected = await selectCell(
      app,
      room.code,
      activeCaptainToken,
      cellId,
    );
    expect(selected.status).toBe(200);

    // The mutation landed (positive anchor for the negative window below).
    const active = await getActiveCell(app, room.code);
    expect(active.status).toBe(200);
    expect(active.body.state).toBe('SELECTED');

    await captainNotPrompted;
  });
});

import { INestApplication } from '@nestjs/common';
import { AppConfigService } from '../../src/config/app-config.service';
import { ShopTimerRegistry } from '../../src/game-session/application/timers';
import {
  getBoard,
  getGameState,
  openQuestion,
  reviewAnswer,
  selectCell,
  submitAnswer,
} from './gameplay-client';
import {
  CreatedRoom,
  createRoom,
  createTeam,
  joinRoom,
  setReady,
  startGame,
} from './lobby-client';

/**
 * Shared e2e battle driver for the commerce suites (extracted from the 8.2
 * shop-flow spec). Drives the lobby to a started game and plays full battle
 * cycles so a suite can reach a shop threshold with a handful of live cycles
 * (combined with the db-write counter presets). Both shop-flow (8.2) and
 * shop-purchase (8.3) reuse these, so the battle-cycle path stays a single
 * proven implementation.
 */

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A 2-second shop window with a 1-second close minimum so both the
 * minimum-block and the expiry path are exercisable in real time. The answer
 * timer is NOT overridden — battle cycles complete well within its default.
 */
export const FAST_SHOP_TIMER = new ShopTimerRegistry({
  timers: { shopSeconds: 2, shopMinSeconds: 1 },
} as unknown as AppConfigService);

/** The started game plus a map from each team id to its captain's token. */
export interface StartedBattle {
  room: CreatedRoom;
  roomId: string;
  tokenByTeam: Record<string, string>;
}

/** Drive the lobby to a started game; map each team to its captain token. */
export async function startBattle(
  app: INestApplication,
): Promise<StartedBattle> {
  const room = await createRoom(app);
  const alice = await joinRoom(app, room.code, 'Alice');
  const bob = await joinRoom(app, room.code, 'Bob');
  const reds = await createTeam(app, room.code, alice.token, 'Reds');
  const blues = await createTeam(app, room.code, bob.token, 'Blues');
  await setReady(app, room.code, reds.id, alice.token, true);
  await setReady(app, room.code, blues.id, bob.token, true);
  const snapshot = await startGame(app, room.code, room.hostToken);

  expect(snapshot.room.currentStage).toBe('GAME_BOARD');
  const tokenByTeam: Record<string, string> = {
    [reds.id]: alice.token,
    [blues.id]: bob.token,
  };
  return { room, roomId: snapshot.room.id, tokenByTeam };
}

/**
 * One full battle cycle driven by whoever holds the turn: the active captain
 * selects the first AVAILABLE cell, the host opens, the captain answers, the
 * host accepts.
 */
export async function playCycle(
  app: INestApplication,
  room: CreatedRoom,
  tokenByTeam: Record<string, string>,
): Promise<void> {
  const state = await getGameState(app, room.code);
  expect(state.status).toBe(200);
  expect(state.body.room.currentStage).toBe('GAME_BOARD');
  const captainToken = tokenByTeam[state.body.room.currentTeamId as string];
  expect(captainToken).toBeDefined();

  const board = await getBoard(app, room.code);
  expect(board.status).toBe(200);
  const cell = board.body.cells.find(
    (candidate: { state: string }) => candidate.state === 'AVAILABLE',
  );
  expect(cell).toBeDefined();

  const selected = await selectCell(app, room.code, captainToken, cell.id);
  expect(selected.status).toBe(200);
  const opened = await openQuestion(app, room.code, room.hostToken, cell.id);
  expect(opened.status).toBe(200);
  const answered = await submitAnswer(app, room.code, captainToken, 'answer');
  expect(answered.status).toBe(200);
  const reviewed = await reviewAnswer(app, room.code, room.hostToken, true);
  expect(reviewed.status).toBe(200);
}

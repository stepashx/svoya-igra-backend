import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2EApp } from '../utils/create-e2e-app';
import { closeDbReadPool, readBoardCells } from '../utils/db-read';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import {
  createRoom,
  createTeam,
  HOST_HEADER,
  joinRoom,
  setReady,
  startGame,
} from '../utils/lobby-client';

describe('Board init on game start (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = (await createE2EApp()).app;
  });

  afterAll(async () => {
    await app.close();
    await closeTruncatePool();
    await closeDbReadPool();
  });

  beforeEach(async () => {
    await truncateLobby();
  });

  /** Drive the lobby through to a started game with two ready teams. */
  const startWithTwoTeams = async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');
    const bob = await joinRoom(app, room.code, 'Bob');
    const reds = await createTeam(app, room.code, alice.token, 'Reds');
    const blues = await createTeam(app, room.code, bob.token, 'Blues');
    await setReady(app, room.code, reds.id, alice.token, true);
    await setReady(app, room.code, blues.id, bob.token, true);
    const snapshot = await startGame(app, room.code, room.hostToken);
    return { room, snapshot };
  };

  it('seeds exactly 30 AVAILABLE cells matching the seed catalog layout', async () => {
    const { snapshot } = await startWithTwoTeams();
    expect(snapshot.room.currentStage).toBe('GAME_BOARD');

    const cells = await readBoardCells(snapshot.room.id);
    expect(cells).toHaveLength(30);
    expect(cells.every((cell) => cell.state === 'AVAILABLE')).toBe(true);
    expect(cells.every((cell) => cell.room_id === snapshot.room.id)).toBe(true);

    // 6 categories, each with the five positions 0..4.
    const positionsByCategory = new Map<string, number[]>();
    for (const cell of cells) {
      const positions = positionsByCategory.get(cell.category_id) ?? [];
      positions.push(cell.position);
      positionsByCategory.set(cell.category_id, positions);
    }
    expect(positionsByCategory.size).toBe(6);
    for (const positions of positionsByCategory.values()) {
      expect([...positions].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    }

    // Costs 100/200/400/600/800, six cells of each.
    const countByPoints = new Map<number, number>();
    for (const cell of cells) {
      countByPoints.set(cell.points, (countByPoints.get(cell.points) ?? 0) + 1);
    }
    expect([...countByPoints.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [100, 6],
      [200, 6],
      [400, 6],
      [600, 6],
      [800, 6],
    ]);
  });

  it('does not duplicate the board: a second start is rejected, board stays at 30', async () => {
    const { room, snapshot } = await startWithTwoTeams();

    // The room is already at GAME_BOARD, so re-starting is an illegal stage
    // transition (409) — board-init never runs a second time.
    await request(app.getHttpServer())
      .post(`/api/rooms/${room.code}/game/start`)
      .set(HOST_HEADER, room.hostToken)
      .expect(409);

    const cells = await readBoardCells(snapshot.room.id);
    expect(cells).toHaveLength(30);
  });
});

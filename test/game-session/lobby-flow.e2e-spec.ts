import { INestApplication } from '@nestjs/common';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import {
  createRoom,
  createTeam,
  joinRoom,
  listTopics,
  selectTopic,
  setReady,
  startGame,
} from '../utils/lobby-client';

describe('Lobby happy-path flow (e2e)', () => {
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
  });

  beforeEach(async () => {
    await truncateLobby();
    events.length = 0;
  });

  it('runs create → join → team → topic → ready → start', async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');
    const bob = await joinRoom(app, room.code, 'Bob');

    const reds = await createTeam(app, room.code, alice.token, 'Reds');
    const blues = await createTeam(app, room.code, bob.token, 'Blues');
    expect(reds.captainPlayerId).toBe(alice.id);
    expect(blues.captainPlayerId).toBe(bob.id);

    // Reds picks a topic; Blues leaves it to auto-assignment.
    const topics = await listTopics(app);
    await selectTopic(app, room.code, reds.id, alice.token, topics[0].id);

    await setReady(app, room.code, reds.id, alice.token, true);
    await setReady(app, room.code, blues.id, bob.token, true);

    const snapshot = await startGame(app, room.code, room.hostToken);

    expect(snapshot.room.currentStage).toBe('GAME_BOARD');
    expect(snapshot.room.currentTeamId).not.toBeNull();

    const red = snapshot.teams.find((t) => t.id === reds.id);
    const blue = snapshot.teams.find((t) => t.id === blues.id);
    expect(red?.turnOrder).not.toBeNull();
    expect(blue?.turnOrder).not.toBeNull();
    // Blues had no topic → auto-assigned a distinct free one.
    expect(blue?.selectedTopicId).not.toBeNull();
    expect(blue?.selectedTopicId).not.toBe(red?.selectedTopicId);
    expect(snapshot.room.currentTeamId).toBe(
      [red, blue].find((t) => t?.turnOrder === 0)?.id,
    );
  });

  it('broadcasts the room-wide lobby + game-start events', async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');
    const bob = await joinRoom(app, room.code, 'Bob');
    const reds = await createTeam(app, room.code, alice.token, 'Reds');
    const blues = await createTeam(app, room.code, bob.token, 'Blues');
    await setReady(app, room.code, reds.id, alice.token, true);
    await setReady(app, room.code, blues.id, bob.token, true);
    await startGame(app, room.code, room.hostToken);

    const names = new Set(events.map((e) => e.event));
    expect(names).toContain('server:game-session:player-joined');
    expect(names).toContain('server:game-session:team-created');
    expect(names).toContain('server:game-session:game-stage-changed');
    expect(names).toContain('server:game-session:team-ready-changed');
    expect(names).toContain('server:game-session:game-started');
    expect(names).toContain('server:game-session:game-turn-changed');
  });

  it('serialises concurrent setReady under the per-room lock → READY_CHECK → start', async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');
    const bob = await joinRoom(app, room.code, 'Bob');
    const reds = await createTeam(app, room.code, alice.token, 'Reds');
    const blues = await createTeam(app, room.code, bob.token, 'Blues');

    // Both captains flip ready at the same instant. The per-room advisory lock
    // serialises the ready-count read and the threshold transition, so the room
    // reaches READY_CHECK exactly once (no lost update) and the host can start.
    await Promise.all([
      setReady(app, room.code, reds.id, alice.token, true),
      setReady(app, room.code, blues.id, bob.token, true),
    ]);

    const stageChanges = events.filter(
      (e) => e.event === 'server:game-session:game-stage-changed',
    );
    const readyCheckTransitions = stageChanges.filter(
      (e) => (e.payload as { stage?: string }).stage === 'READY_CHECK',
    );
    expect(readyCheckTransitions).toHaveLength(1);

    const snapshot = await startGame(app, room.code, room.hostToken);
    expect(snapshot.room.currentStage).toBe('GAME_BOARD');
  });
});

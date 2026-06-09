import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2EApp } from '../utils/create-e2e-app';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import {
  createRoom,
  createTeam,
  HOST_HEADER,
  joinRoom,
  JoinedPlayer,
  joinTeam,
  listTopics,
  PLAYER_HEADER,
  selectTopic,
  setReady,
} from '../utils/lobby-client';

describe('Lobby negatives (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = (await createE2EApp()).app;
  });
  afterAll(async () => {
    await app.close();
    await closeTruncatePool();
  });
  beforeEach(async () => {
    await truncateLobby();
  });

  it('rejects a duplicate player name with 409 PLAYER_NAME_TAKEN', async () => {
    const room = await createRoom(app);
    await joinRoom(app, room.code, 'Alice');
    const res = await http()
      .post(`/api/rooms/${room.code}/players`)
      .send({ name: 'Alice' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLAYER_NAME_TAKEN');
  });

  it('rejects a duplicate topic with 409 TOPIC_ALREADY_TAKEN', async () => {
    const room = await createRoom(app);
    const a = await joinRoom(app, room.code, 'Alice');
    const b = await joinRoom(app, room.code, 'Bob');
    const reds = await createTeam(app, room.code, a.token, 'Reds');
    const blues = await createTeam(app, room.code, b.token, 'Blues');
    const topics = await listTopics(app);
    await selectTopic(app, room.code, reds.id, a.token, topics[0].id);

    const res = await http()
      .patch(`/api/rooms/${room.code}/teams/${blues.id}/topic`)
      .set(PLAYER_HEADER, b.token)
      .send({ topicId: topics[0].id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TOPIC_ALREADY_TAKEN');
  });

  it('rejects a 4th team with 409 TEAM_LIMIT_REACHED', async () => {
    const room = await createRoom(app);
    const names = ['A', 'B', 'C', 'D'];
    const players: JoinedPlayer[] = [];
    for (const name of names) {
      players.push(await joinRoom(app, room.code, name));
    }
    await createTeam(app, room.code, players[0].token, 'T1');
    await createTeam(app, room.code, players[1].token, 'T2');
    await createTeam(app, room.code, players[2].token, 'T3');

    const res = await http()
      .post(`/api/rooms/${room.code}/teams`)
      .set(PLAYER_HEADER, players[3].token)
      .send({ name: 'T4' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_LIMIT_REACHED');
  });

  it('rejects the 6th team member with 409 TEAM_FULL', async () => {
    const room = await createRoom(app);
    const captain = await joinRoom(app, room.code, 'Cap');
    const team = await createTeam(app, room.code, captain.token, 'Reds');
    // Captain is member 1; four joiners fill the team to 5.
    for (const name of ['M2', 'M3', 'M4', 'M5']) {
      const member = await joinRoom(app, room.code, name);
      await joinTeam(app, room.code, team.id, member.token);
    }
    const sixth = await joinRoom(app, room.code, 'M6');

    const res = await http()
      .post(`/api/rooms/${room.code}/teams/${team.id}/members`)
      .set(PLAYER_HEADER, sixth.token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TEAM_FULL');
  });

  it('forbids a non-captain action with 403 NOT_TEAM_CAPTAIN', async () => {
    const room = await createRoom(app);
    const captain = await joinRoom(app, room.code, 'Cap');
    const member = await joinRoom(app, room.code, 'Member');
    const team = await createTeam(app, room.code, captain.token, 'Reds');
    await joinTeam(app, room.code, team.id, member.token);

    const res = await http()
      .patch(`/api/rooms/${room.code}/teams/${team.id}/ready`)
      .set(PLAYER_HEADER, member.token)
      .send({ isReady: true });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_TEAM_CAPTAIN');
  });

  it('rejects starting with too few ready teams (409 NOT_ENOUGH_READY_TEAMS)', async () => {
    const room = await createRoom(app);
    const a = await joinRoom(app, room.code, 'Alice');
    const reds = await createTeam(app, room.code, a.token, 'Reds');
    await setReady(app, room.code, reds.id, a.token, true);

    const res = await http()
      .post(`/api/rooms/${room.code}/game/start`)
      .set(HOST_HEADER, room.hostToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_ENOUGH_READY_TEAMS');
  });

  it('forbids a non-host from starting (403 NOT_ROOM_HOST)', async () => {
    const room = await createRoom(app);
    const res = await http()
      .post(`/api/rooms/${room.code}/game/start`)
      .set(HOST_HEADER, 'wrong-token');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ROOM_HOST');
  });

  it('returns 404 ROOM_NOT_FOUND for an unknown code', async () => {
    const res = await http().get('/api/rooms/ZZZZZZ');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROOM_NOT_FOUND');
  });

  it('returns 400 for an empty player name', async () => {
    const room = await createRoom(app);
    const res = await http()
      .post(`/api/rooms/${room.code}/players`)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('refuses to join a closed room with 409 ROOM_NOT_ACTIVE', async () => {
    const room = await createRoom(app);
    await http()
      .post(`/api/rooms/${room.code}/close`)
      .set(HOST_HEADER, room.hostToken)
      .expect(200);

    const res = await http()
      .post(`/api/rooms/${room.code}/players`)
      .send({ name: 'Latecomer' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROOM_NOT_ACTIVE');
  });
});

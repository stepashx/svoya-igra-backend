import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2EApp } from '../utils/create-e2e-app';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import {
  createRoom,
  createTeam,
  joinRoom,
  joinTeam,
  listTopics,
  selectTopic,
} from '../utils/lobby-client';

describe('Lobby read endpoints (e2e)', () => {
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

  /** Create a room with two players, one team (captain + member) and a topic. */
  const setupLobby = async () => {
    const room = await createRoom(app);
    const captain = await joinRoom(app, room.code, 'Cap');
    const member = await joinRoom(app, room.code, 'Member');
    const team = await createTeam(app, room.code, captain.token, 'Reds');
    await joinTeam(app, room.code, team.id, member.token);
    const topics = await listTopics(app);
    await selectTopic(app, room.code, team.id, captain.token, topics[0].id);
    return { room, captain, member, team, topicId: topics[0].id };
  };

  it('gets a room by code', async () => {
    const { room } = await setupLobby();
    const res = await http().get(`/api/rooms/${room.code}`).expect(200);
    expect(res.body.code).toBe(room.code);
    expect(res.body).not.toHaveProperty('hostReconnectToken');
  });

  it('gets the room status', async () => {
    const { room } = await setupLobby();
    const res = await http().get(`/api/rooms/${room.code}/status`).expect(200);
    expect(res.body).toEqual({ status: 'ACTIVE', currentStage: 'TEAM_SETUP' });
  });

  it('gets the full room state', async () => {
    const { room } = await setupLobby();
    const res = await http().get(`/api/rooms/${room.code}/state`).expect(200);
    expect(res.body.players).toHaveLength(2);
    expect(res.body.teams).toHaveLength(1);
    expect(res.body.players[0]).not.toHaveProperty('reconnectToken');
  });

  it('lists the global topic catalog', async () => {
    const res = await http().get('/api/topics').expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
  });

  it('lists topics with room availability', async () => {
    const { room, team, topicId } = await setupLobby();
    const res = await http().get(`/api/rooms/${room.code}/topics`).expect(200);
    const taken = res.body.find(
      (t: { topic: { id: string } }) => t.topic.id === topicId,
    );
    expect(taken.takenByTeamId).toBe(team.id);
    const free = res.body.filter(
      (t: { takenByTeamId: string | null }) => t.takenByTeamId === null,
    );
    expect(free.length).toBeGreaterThanOrEqual(1);
  });

  it('lists players and teams', async () => {
    const { room } = await setupLobby();
    const players = await http()
      .get(`/api/rooms/${room.code}/players`)
      .expect(200);
    expect(players.body).toHaveLength(2);
    const teams = await http().get(`/api/rooms/${room.code}/teams`).expect(200);
    expect(teams.body).toHaveLength(1);
  });

  it('gets a team with its members and its captain', async () => {
    const { room, team, captain } = await setupLobby();
    const detail = await http()
      .get(`/api/rooms/${room.code}/teams/${team.id}`)
      .expect(200);
    expect(detail.body.team.id).toBe(team.id);
    expect(detail.body.members).toHaveLength(2);

    const cap = await http()
      .get(`/api/rooms/${room.code}/teams/${team.id}/captain`)
      .expect(200);
    expect(cap.body.id).toBe(captain.id);
  });

  it('gets the current stage', async () => {
    const { room } = await setupLobby();
    const res = await http()
      .get(`/api/rooms/${room.code}/game/stage`)
      .expect(200);
    expect(res.body).toEqual({ currentStage: 'TEAM_SETUP' });
  });

  it('returns 404 for reads on an unknown room', async () => {
    await http().get('/api/rooms/ZZZZZZ/state').expect(404);
  });
});

import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2EApp } from '../utils/create-e2e-app';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import {
  createRoom,
  HOST_HEADER,
  joinRoom,
  PLAYER_HEADER,
} from '../utils/lobby-client';

describe('Reconnect over REST (e2e)', () => {
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

  it('reconnects a player by X-Player-Token and returns the snapshot', async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');

    const res = await http()
      .post(`/api/rooms/${room.code}/players/reconnect`)
      .set(PLAYER_HEADER, alice.token)
      .expect(200);

    expect(res.body.room.code).toBe(room.code);
    const me = res.body.players.find((p: { id: string }) => p.id === alice.id);
    expect(me.connectionStatus).toBe('CONNECTED');
  });

  it('reconnects the host by X-Host-Token and returns the snapshot', async () => {
    const room = await createRoom(app);
    await joinRoom(app, room.code, 'Alice');

    const res = await http()
      .post(`/api/rooms/${room.code}/host/reconnect`)
      .set(HOST_HEADER, room.hostToken)
      .expect(200);

    expect(res.body.room.code).toBe(room.code);
    expect(res.body.players).toHaveLength(1);
  });

  it('rejects a player reconnect with an unknown token (401)', async () => {
    const room = await createRoom(app);
    const res = await http()
      .post(`/api/rooms/${room.code}/players/reconnect`)
      .set(PLAYER_HEADER, 'unknown-but-well-formed-token');
    expect(res.status).toBe(401);
  });

  it('rejects a host reconnect with a wrong token (403)', async () => {
    const room = await createRoom(app);
    const res = await http()
      .post(`/api/rooms/${room.code}/host/reconnect`)
      .set(HOST_HEADER, 'nope');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ROOM_HOST');
  });
});

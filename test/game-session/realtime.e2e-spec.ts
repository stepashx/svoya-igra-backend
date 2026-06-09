import { INestApplication } from '@nestjs/common';
import { Socket } from 'socket.io-client';
import { RoomStateResponseDto } from '../../src/game-session/presentation/dto/response';
import { closeDbReadPool, readPlayerConnectionStatus } from '../utils/db-read';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import { createRoom, joinRoom } from '../utils/lobby-client';
import {
  awaitConnect,
  awaitEvent,
  closeSockets,
  connectRealtime,
  expectNoEvent,
  settle,
} from '../utils/realtime-client';
import { createRealtimeE2EApp } from '../utils/realtime-e2e-app';

const CONNECTION_RESTORED = 'server:realtime:connection-restored';
const CONNECTION_LOST = 'server:realtime:connection-lost';
const ROOM_STATE = 'server:game-session:room-state';
const GAME_SESSION_ERROR = 'server:game-session:error';
const CLIENT_RECONNECTED = 'server:game-session:client-reconnected';
const HOST_RECONNECTED = 'server:game-session:host-reconnected';

interface ConnectionRestored {
  roomId: string;
  playerId: string | null;
}
interface ConnectionLost {
  roomId: string;
  playerId: string;
}
interface ClientReconnected {
  roomId: string;
  player: { id: string };
}
interface WsError {
  code: string;
  message: string;
}

describe('Realtime presence & reconnect (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let wsPath: string;
  const open: Socket[] = [];

  const connect = (reconnectToken?: string): Socket => {
    const socket = connectRealtime(port, { path: wsPath, reconnectToken });
    open.push(socket);
    return socket;
  };

  beforeAll(async () => {
    const e2e = await createRealtimeE2EApp();
    app = e2e.app;
    port = e2e.port;
    wsPath = e2e.wsPath;
  });

  afterAll(async () => {
    closeSockets(...open);
    // Let server-side handleDisconnect work finish before the pool closes.
    await settle();
    await app.close();
    await closeTruncatePool();
    await closeDbReadPool();
  });

  beforeEach(async () => {
    await truncateLobby();
  });

  afterEach(async () => {
    closeSockets(...open);
    open.length = 0;
    await settle();
  });

  // (a) Originating-socket snapshot for a reconnecting player.
  it('(a) sends connection-restored + room-state to a reconnecting player socket', async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');

    const socket = connect(alice.token);
    const restored = awaitEvent<ConnectionRestored>(
      socket,
      CONNECTION_RESTORED,
    );
    const state = awaitEvent<RoomStateResponseDto>(socket, ROOM_STATE);
    await awaitConnect(socket);

    expect(await restored).toEqual({
      roomId: expect.any(String),
      playerId: alice.id,
    });
    const snapshot = await state;
    expect(snapshot.room.code).toBe(room.code);
    expect(snapshot.players.some((p) => p.id === alice.id)).toBe(true);
  });

  // (b) Host reconnect: null playerId originating + room-wide host-reconnected.
  it('(b) restores the host (null playerId) and broadcasts host-reconnected room-wide', async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');

    const observer = connect(alice.token);
    await awaitConnect(observer);
    await awaitEvent(observer, ROOM_STATE);

    const hostReconnected = awaitEvent(observer, HOST_RECONNECTED);
    const hostSocket = connect(room.hostToken);
    const restored = awaitEvent<ConnectionRestored>(
      hostSocket,
      CONNECTION_RESTORED,
    );
    await awaitConnect(hostSocket);

    expect(await restored).toEqual({
      roomId: expect.any(String),
      playerId: null,
    });
    expect(await hostReconnected).toMatchObject({ hostId: room.hostId });
  });

  // (c) Unknown token: one error then a forced disconnect, no snapshot.
  it('(c) rejects an unknown token with INVALID_RECONNECT_TOKEN then disconnects', async () => {
    const socket = connect('unknown-but-wellformed-token');
    const error = awaitEvent<WsError>(socket, GAME_SESSION_ERROR);
    const disconnected = new Promise<void>((resolve) =>
      socket.once('disconnect', () => resolve()),
    );

    expect(await error).toEqual({
      code: 'INVALID_RECONNECT_TOKEN',
      message: expect.any(String),
    });
    await disconnected;
    expect(socket.connected).toBe(false);
  });

  // (d) Last socket drop → connection-lost room-wide + DISCONNECTED in DB.
  it('(d) marks the player DISCONNECTED and broadcasts connection-lost when the last socket drops', async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');
    const bob = await joinRoom(app, room.code, 'Bob');

    const observer = connect(bob.token);
    await awaitConnect(observer);
    await awaitEvent(observer, ROOM_STATE);

    const aliceSocket = connect(alice.token);
    await awaitConnect(aliceSocket);
    await awaitEvent(aliceSocket, ROOM_STATE);

    const lost = awaitEvent<ConnectionLost>(observer, CONNECTION_LOST, {
      match: (p) => p.playerId === alice.id,
    });
    aliceSocket.disconnect();

    expect(await lost).toEqual({
      roomId: expect.any(String),
      playerId: alice.id,
    });
    expect(await readPlayerConnectionStatus(alice.id)).toBe('DISCONNECTED');
  });

  // (e) Multi-tab presence: one tab closing keeps the player present; the last
  // one drops it; a fresh socket reconnects and restores CONNECTED.
  it('(e) keeps a player present across tabs and restores CONNECTED on reconnect', async () => {
    const room = await createRoom(app);
    const alice = await joinRoom(app, room.code, 'Alice');
    const bob = await joinRoom(app, room.code, 'Bob');

    const observer = connect(bob.token);
    await awaitConnect(observer);
    await awaitEvent(observer, ROOM_STATE);

    const tab1 = connect(alice.token);
    const tab2 = connect(alice.token);
    await Promise.all([awaitConnect(tab1), awaitConnect(tab2)]);
    await Promise.all([
      awaitEvent(tab1, ROOM_STATE),
      awaitEvent(tab2, ROOM_STATE),
    ]);

    // Closing one tab is NOT the last socket → no connection-lost; still CONNECTED.
    const noLost = expectNoEvent<ConnectionLost>(observer, CONNECTION_LOST, {
      match: (p) => p.playerId === alice.id,
      windowMs: 600,
    });
    tab1.disconnect();
    await noLost;
    expect(await readPlayerConnectionStatus(alice.id)).toBe('CONNECTED');

    // Closing the last tab drops presence → connection-lost + DISCONNECTED.
    const lost = awaitEvent<ConnectionLost>(observer, CONNECTION_LOST, {
      match: (p) => p.playerId === alice.id,
    });
    tab2.disconnect();
    await lost;
    expect(await readPlayerConnectionStatus(alice.id)).toBe('DISCONNECTED');

    // A fresh socket reconnects → client-reconnected room-wide + CONNECTED again.
    const reconnected = awaitEvent<ClientReconnected>(
      observer,
      CLIENT_RECONNECTED,
      { match: (p) => p.player?.id === alice.id },
    );
    const tab3 = connect(alice.token);
    await awaitConnect(tab3);
    await reconnected;
    expect(await readPlayerConnectionStatus(alice.id)).toBe('CONNECTED');
  });
});

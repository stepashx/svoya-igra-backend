import { io, Socket } from 'socket.io-client';

export interface ConnectOptions {
  /** Socket.IO path (from the app config). */
  path: string;
  /** Reconnect token placed on the handshake `auth`. */
  reconnectToken?: string;
}

/**
 * Open a socket.io-client against the e2e server. Forces the WebSocket transport
 * (skips polling) and disables client-side auto-reconnect so a `disconnect()`
 * stays disconnected — the server-side presence drop is what we assert.
 */
export function connectRealtime(port: number, options: ConnectOptions): Socket {
  return io(`http://127.0.0.1:${port}`, {
    path: options.path,
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    auth: options.reconnectToken
      ? { reconnectToken: options.reconnectToken }
      : {},
  });
}

/** Resolve once the socket connects; reject on error/timeout. */
export function awaitConnect(socket: Socket, timeoutMs = 4000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (socket.connected) {
      resolve();
      return;
    }
    const timer = setTimeout(
      () => reject(new Error('socket connect timeout')),
      timeoutMs,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

export interface AwaitEventOptions<T> {
  timeoutMs?: number;
  /** Only resolve for a payload matching this predicate (ignore others). */
  match?: (payload: T) => boolean;
}

/** Resolve with the first matching `event` payload, or reject after a timeout. */
export function awaitEvent<T = unknown>(
  socket: Socket,
  event: string,
  options: AwaitEventOptions<T> = {},
): Promise<T> {
  const { timeoutMs = 4000, match } = options;
  return new Promise<T>((resolve, reject) => {
    const pending: { timer?: NodeJS.Timeout } = {};
    const handler = (payload: T): void => {
      if (match && !match(payload)) {
        return;
      }
      clearTimeout(pending.timer);
      socket.off(event, handler);
      resolve(payload);
    };
    pending.timer = setTimeout(() => {
      socket.off(event, handler);
      reject(
        new Error(`Timed out waiting for "${event}" after ${timeoutMs}ms`),
      );
    }, timeoutMs);
    socket.on(event, handler);
  });
}

export interface ExpectNoEventOptions<T> {
  windowMs?: number;
  match?: (payload: T) => boolean;
}

/** Resolve if NO matching `event` arrives within the window (negative check). */
export function expectNoEvent<T = unknown>(
  socket: Socket,
  event: string,
  options: ExpectNoEventOptions<T> = {},
): Promise<void> {
  const { windowMs = 400, match } = options;
  return new Promise<void>((resolve, reject) => {
    const pending: { timer?: NodeJS.Timeout } = {};
    const handler = (payload: T): void => {
      if (match && !match(payload)) {
        return;
      }
      clearTimeout(pending.timer);
      socket.off(event, handler);
      reject(new Error(`Unexpected "${event}" received within ${windowMs}ms`));
    };
    pending.timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, windowMs);
    socket.on(event, handler);
  });
}

/** Disconnect any still-connected sockets (test cleanup). */
export function closeSockets(...sockets: Socket[]): void {
  for (const socket of sockets) {
    if (socket.connected) {
      socket.disconnect();
    }
  }
}

/**
 * Let the server drain in-flight `handleDisconnect` work (its async DB write)
 * after sockets close, so teardown doesn't race the closing pool. Server-side
 * disconnect handling isn't observable from the client, so a short settle is the
 * pragmatic wait.
 */
export function settle(ms = 200): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

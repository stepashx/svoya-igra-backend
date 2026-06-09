import { Socket } from 'socket.io';

/**
 * Read a reconnect token from the socket handshake — `auth.reconnectToken`
 * first, then `?reconnectToken=`. A deliberate local copy of the base gateway's
 * private reader so 5.2b leaves `realtime.gateway.ts` untouched.
 */
export function readReconnectToken(client: Socket): string | undefined {
  const fromAuth = (client.handshake.auth as { reconnectToken?: unknown })
    ?.reconnectToken;
  if (typeof fromAuth === 'string') {
    return fromAuth;
  }
  const fromQuery = client.handshake.query?.reconnectToken;
  return typeof fromQuery === 'string' ? fromQuery : undefined;
}

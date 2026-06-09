/**
 * Canonical server → client event names for the transport/connection lifecycle
 * (area `realtime`, plan §16.1). Kept in the application layer — beside the use
 * case and gateway that emit them — so neither imports the transport module
 * (mirrors {@link GameSessionEvent}).
 *
 * Audience differs per event (see docs/realtime-events.md):
 *   - `connection-lost`     → room (emitted by MarkClientDisconnectedUseCase)
 *   - `connection-restored` → originating socket (emitted by GameSessionGateway)
 *   - `error`               → originating socket (GameSessionGateway; the
 *     secret-free fallback for a non-{@link AppError} thrown while handling a
 *     handshake)
 */
export const ConnectionEvent = {
  ConnectionLost: 'server:realtime:connection-lost',
  ConnectionRestored: 'server:realtime:connection-restored',
  Error: 'server:realtime:error',
} as const;

export type ConnectionEvent =
  (typeof ConnectionEvent)[keyof typeof ConnectionEvent];

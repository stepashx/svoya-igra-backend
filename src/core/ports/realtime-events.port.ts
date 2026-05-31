/**
 * Outbound port for publishing realtime events. The application layer depends
 * on this; the WebSocket gateway (Realtime area) implements it as pure
 * transport. No concrete game events are defined in Stage 3 — only the seam.
 */
export interface RealtimeEventsPort {
  /** Broadcast an event to every client subscribed to a room. */
  emitToRoom(roomId: string, event: string, payload: unknown): void;
}

export const REALTIME_EVENTS_PORT = Symbol('RealtimeEventsPort');

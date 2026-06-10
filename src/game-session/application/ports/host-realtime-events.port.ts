/**
 * Outbound port for host-only realtime delivery (sub-stage 6.2b). The battle
 * use cases publish host-audience events (§16.4: `cell-selection-requested`,
 * `question-correct-answer-shown-to-host`) through this seam instead of a
 * room-wide broadcast, so secrets never depend on transport group membership
 * (a public `join-room` must not leak the correct answer). Fire-and-forget
 * synchronous void, mirroring the core RealtimeEventsPort; the presentation/ws
 * adapter resolves the host's live sockets via the presence registry. With no
 * host socket connected the call is a no-op — REST stays the source of truth.
 */
export interface HostRealtimeEventsPort {
  /** Send an event to every live socket of the room's host. */
  emitToHost(roomId: string, event: string, payload: unknown): void;
}

export const HOST_REALTIME_EVENTS_PORT = Symbol('HostRealtimeEventsPort');

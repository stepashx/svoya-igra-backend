/**
 * Outbound port for team-only realtime delivery (sub-stage 8.3). The purchase
 * use case publishes the team-audience `inventory-updated` event — the only
 * channel allowed to carry the QR `publicUrl` — through this seam instead of a
 * room-wide broadcast, so the bought tool never depends on transport group
 * membership (a public `join-room` must not leak a team's QR).
 *
 * Unlike the synchronous {@link HostRealtimeEventsPort}, `emitToTeam` is
 * ASYNC: the presentation/ws adapter resolves the team's roster from the
 * player repository before fanning out to each member's live sockets. With no
 * member socket connected the call is a no-op — the team reads its inventory
 * over the guarded REST surface instead (§15.9). Delivery is best-effort: the
 * adapter swallows and logs its own failures so a broadcast hiccup never fails
 * the committed purchase.
 */
export interface TeamRealtimeEventsPort {
  /** Send an event to every live socket of every member of a team. */
  emitToTeam(teamId: string, event: string, payload: unknown): Promise<void>;
}

export const TEAM_REALTIME_EVENTS_PORT = Symbol('TeamRealtimeEventsPort');

/**
 * Realtime event-naming convention (transport naming only — concrete feature
 * events live in the area catalogs, §16.x; see docs/realtime-events.md).
 *
 * Names are direction-aware and area-scoped:
 *   - server->client broadcasts: `server:<area>:<event>`
 *   - client->server commands:   `client:<area>:<command>`
 *
 * Audience is a publishing concern, not part of the name: room-wide, host-only,
 * team-only, and captain-only deliveries are all addressed by emitting to the
 * appropriate socket group in a later stage. Concrete feature event catalogs
 * (Game Session, Gameplay, Commerce, Presentation, Evaluation) are defined with
 * their features — see docs/realtime-events.md.
 */
export type EventDirection = 'server' | 'client';

/** Audience categories for documentation/reference; not encoded in the name. */
export const EventAudience = {
  Room: 'room',
  Host: 'host',
  Team: 'team',
  Captain: 'captain',
  /** Only the single source socket — snapshots/errors returned to the caller. */
  OriginatingSocket: 'originating-socket',
} as const;

export type EventAudience = (typeof EventAudience)[keyof typeof EventAudience];

/** Build a convention-compliant event name: `<direction>:<area>:<name>`. */
export function realtimeEventName(
  direction: EventDirection,
  area: string,
  name: string,
): string {
  return `${direction}:${area}:${name}`;
}

/**
 * The only transport-level command the base gateway understands: a socket asks
 * to join a room group. This is pure socket grouping — business room membership
 * comes from the REST identity (the reconnect token), not from this command.
 */
export const REALTIME_JOIN_ROOM = realtimeEventName(
  'client',
  'realtime',
  'join-room',
);

/** Transport-level command to leave a room group. */
export const REALTIME_LEAVE_ROOM = realtimeEventName(
  'client',
  'realtime',
  'leave-room',
);

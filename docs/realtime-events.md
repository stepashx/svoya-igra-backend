# Realtime Event Contract

Transport: WebSocket (Socket.IO) sharing the single backend process/URL with
REST. The base gateway (`src/realtime/realtime.gateway.ts`) is **transport
only** — it groups sockets by room and broadcasts events published through
`RealtimeEventsPort`. It contains no business logic and validates no game state.

This document is the single place where realtime events are listed. It is
intentionally a **seam** right now: only the naming convention and the two
transport-level commands exist. Concrete feature events are added with their
stages (Game Session, Gameplay, Commerce, Presentation, Evaluation).

## Naming convention

Event names are direction-aware and area-scoped:

- `server:<area>:<event>` — server → client broadcast
- `client:<area>:<command>` — client → server command

`<area>` matches a compact feature area (`game-session`, `gameplay`,
`commerce`, `presentation`, `evaluation`, `realtime`). Build names with
`realtimeEventName(direction, area, name)` from
`src/realtime/realtime-events.constants.ts`.

## Audience

Audience is a **publishing** concern, not part of the event name. A future event
is delivered to the right recipients by emitting to the appropriate socket
group:

- **room-wide** — every socket joined to the room group
- **host-only** — the host socket(s)
- **team-only** — the sockets of one team
- **captain-only** — the captain socket

## Transport-level commands (defined now)

| Event | Direction | Purpose |
|---|---|---|
| `client:realtime:join-room` | client → server | Join the socket to a room group. Transport grouping only — no membership validation. |
| `client:realtime:leave-room` | client → server | Leave the room group. |

## Reconnect (seam only)

A reconnect token may be supplied on the handshake (`auth.reconnectToken` or
query). The gateway reads it but does nothing with it yet — restoring host/player
identity and the state snapshot is the `ReconnectClient` use case (Stage 5B).

## Feature events (added later)

_None yet._ Game Session, Gameplay, Commerce, Presentation, and Evaluation event
rows (name, direction, audience, payload) are filled in as each feature lands.

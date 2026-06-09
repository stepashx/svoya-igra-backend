import { Injectable } from '@nestjs/common';
import { ResolvedSocketIdentity } from './socket-identity.resolver';

/** A live socket and the identity it authenticated as. */
export interface PresenceEntry {
  readonly socketId: string;
  readonly identity: ResolvedSocketIdentity;
}

/** Outcome of removing a socket from the registry. */
export interface PresenceRemoval {
  /** The removed entry, or `null` if the socket was never registered. */
  readonly entry: PresenceEntry | null;
  /** `true` when the removed socket was the identity's last live socket. */
  readonly lastForIdentity: boolean;
}

/** Reverse-map key: a player is keyed by id, the host by room. */
export function presenceIdentityKey(identity: ResolvedSocketIdentity): string {
  return identity.principal === 'player'
    ? `p:${identity.playerId}`
    : `h:${identity.roomId}`;
}

/**
 * In-memory socket presence for the lobby. Keeps a forward map
 * `socketId → entry` and a reverse map `identityKey → Set<socketId>` so a player
 * with several open tabs counts as one present identity: `unregister` reports
 * `lastForIdentity` only when the final socket of that identity drops, which is
 * when the gateway marks the player DISCONNECTED.
 *
 * Scope: a single process. Multi-node presence (a shared store / the Socket.IO
 * Redis adapter) is out of scope for the MVP and deferred — see
 * docs/realtime-events.md.
 */
@Injectable()
export class LobbyPresenceRegistry {
  private readonly bySocket = new Map<string, PresenceEntry>();
  private readonly byIdentity = new Map<string, Set<string>>();

  /** Record a socket for an identity (idempotent per socket id). */
  register(socketId: string, identity: ResolvedSocketIdentity): PresenceEntry {
    // A socket id is unique per connection; if it somehow re-registers, drop the
    // stale mapping first so the reverse index never leaks.
    if (this.bySocket.has(socketId)) {
      this.unregister(socketId);
    }

    const entry: PresenceEntry = { socketId, identity };
    this.bySocket.set(socketId, entry);

    const key = presenceIdentityKey(identity);
    const sockets = this.byIdentity.get(key) ?? new Set<string>();
    sockets.add(socketId);
    this.byIdentity.set(key, sockets);

    return entry;
  }

  /** Remove a socket; reports whether it was the identity's last one. */
  unregister(socketId: string): PresenceRemoval {
    const entry = this.bySocket.get(socketId);
    if (!entry) {
      return { entry: null, lastForIdentity: false };
    }

    this.bySocket.delete(socketId);

    const key = presenceIdentityKey(entry.identity);
    const sockets = this.byIdentity.get(key);
    let lastForIdentity = true;
    if (sockets) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.byIdentity.delete(key);
      } else {
        lastForIdentity = false;
      }
    }

    return { entry, lastForIdentity };
  }

  /** Live socket ids for an identity key (diagnostics/tests). */
  socketsForIdentity(identityKey: string): readonly string[] {
    return [...(this.byIdentity.get(identityKey) ?? [])];
  }

  has(socketId: string): boolean {
    return this.bySocket.has(socketId);
  }
}

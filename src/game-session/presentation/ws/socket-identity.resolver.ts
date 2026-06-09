import { Inject, Injectable } from '@nestjs/common';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
} from '../../domain/ports';
import { ReconnectToken } from '../../domain/value-objects';

/**
 * Identity a handshake token resolves to. Mirrors the principal split the HTTP
 * guards attach to a request: a player carries its room and id; the host carries
 * only the room (its id lives on the room aggregate).
 */
export type ResolvedSocketIdentity =
  | { principal: 'player'; roomId: string; playerId: string }
  | { principal: 'host'; roomId: string };

/**
 * Resolves a socket's identity from its handshake reconnect token — the WS
 * mirror of {@link PlayerIdentityGuard}/{@link HostAuthGuard}. A token is matched
 * against players first (`findByReconnectToken`) and then the host slot
 * (`findByHostReconnectToken`). A malformed, blank, or unknown token resolves to
 * `null` (the gateway turns that into an `INVALID_RECONNECT_TOKEN` rejection):
 * there is no TTL, so an expired token is simply "not found" and takes the same
 * path.
 */
@Injectable()
export class SocketIdentityResolver {
  constructor(
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
  ) {}

  async resolve(
    rawToken: string | undefined,
  ): Promise<ResolvedSocketIdentity | null> {
    const token = this.parseToken(rawToken);
    if (!token) {
      return null;
    }

    const player = await this.players.findByReconnectToken(token);
    if (player) {
      return {
        principal: 'player',
        roomId: player.roomId,
        playerId: player.id,
      };
    }

    const room = await this.rooms.findByHostReconnectToken(token);
    if (room) {
      return { principal: 'host', roomId: room.id };
    }

    return null;
  }

  /** A malformed/blank token is treated as unknown (→ null), never an error. */
  private parseToken(raw: string | undefined): ReconnectToken | null {
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }
    try {
      return ReconnectToken.create(raw);
    } catch {
      return null;
    }
  }
}

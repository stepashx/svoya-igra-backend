import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ForbiddenError } from '../../../core/errors/app.error';
import { NotRoomHostError, RoomNotFoundError } from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
} from '../../domain/ports';
import { ReconnectToken, RoomCode } from '../../domain/value-objects';
import { HOST_TOKEN_HEADER } from './host-auth.guard';
import { PLAYER_TOKEN_HEADER } from './player-identity.guard';
import { LobbyRequest } from './request-context';

/**
 * Authorises the team-inventory reads (plan §15.9): the QR `publicUrl` is
 * team-owned, so a team's inventory is readable by its OWN members OR the room
 * host — never another team. The two credentials are mutually exclusive:
 *
 * - A PRESENT `X-Host-Token` (any string, even empty) commits the request to
 *   the host path and is validated STRICTLY against the room's host token. A
 *   wrong or empty value is {@link NotRoomHostError} (403) with NO fallthrough
 *   to the player check — presenting a host credential means you are judged as
 *   the host, not silently downgraded to a player.
 * - Otherwise the `X-Player-Token` must resolve to a player of THIS room whose
 *   `teamId` equals the `:teamId` in the path. A player with no team or a
 *   different team is 403; a missing/unknown token is 401.
 *
 * Membership is checked against the player's CURRENT team. (Team-hopping while
 * the shop is open — Join/LeaveTeam are not stage-gated — is a known MVP risk
 * tracked separately, see docs/realtime-events.md; this guard is correct for
 * the membership it sees.)
 */
@Injectable()
export class TeamMemberOrHostGuard implements CanActivate {
  constructor(
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<LobbyRequest>();

    const room = await this.rooms.findByCode(
      RoomCode.create(request.params.code ?? ''),
    );
    if (!room) {
      throw new RoomNotFoundError();
    }

    // A present host token commits to the host path — strict, no fallthrough.
    const hostHeader = request.headers[HOST_TOKEN_HEADER];
    if (typeof hostHeader === 'string') {
      if (hostHeader !== room.hostReconnectToken.value) {
        throw new NotRoomHostError();
      }
      request.hostContext = { roomId: room.id, hostId: room.hostId };
      return true;
    }

    // Player path: a member of THIS room and THIS team.
    const playerHeader = request.headers[PLAYER_TOKEN_HEADER];
    if (typeof playerHeader !== 'string' || playerHeader.length === 0) {
      throw new UnauthorizedException('Missing player token.');
    }
    const player = await this.players.findByReconnectToken(
      this.parseToken(playerHeader),
    );
    if (!player) {
      throw new UnauthorizedException('Unknown player token.');
    }
    if (player.roomId !== room.id) {
      throw new ForbiddenError('Player does not belong to this room.');
    }
    if (player.teamId !== request.params.teamId) {
      throw new ForbiddenError('Player is not a member of this team.');
    }

    request.player = player;
    return true;
  }

  /** A malformed token is an authn failure (401), not a 400. */
  private parseToken(raw: string): ReconnectToken {
    try {
      return ReconnectToken.create(raw);
    } catch {
      throw new UnauthorizedException('Invalid player token.');
    }
  }
}

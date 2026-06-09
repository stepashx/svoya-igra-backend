import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ForbiddenError } from '../../../core/errors/app.error';
import { RoomNotFoundError } from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
} from '../../domain/ports';
import { ReconnectToken, RoomCode } from '../../domain/value-objects';
import { LobbyRequest } from './request-context';

/** Header carrying the player's reconnect/identity token. */
export const PLAYER_TOKEN_HEADER = 'x-player-token';

/**
 * Authenticates player routes by the `X-Player-Token` header (coarse authn):
 * a missing, malformed, or unknown token is 401. It then resolves the room from
 * `:code` and verifies the player belongs to it (different room → 403; missing
 * room → 404). On success it attaches the {@link Player} for
 * {@link CurrentPlayer}. Fine-grained authz (captain/host) stays in the use
 * cases.
 */
@Injectable()
export class PlayerIdentityGuard implements CanActivate {
  constructor(
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<LobbyRequest>();

    const header = request.headers[PLAYER_TOKEN_HEADER];
    if (typeof header !== 'string' || header.length === 0) {
      throw new UnauthorizedException('Missing player token.');
    }
    const token = this.parseToken(header);
    const player = await this.players.findByReconnectToken(token);
    if (!player) {
      throw new UnauthorizedException('Unknown player token.');
    }

    const room = await this.rooms.findByCode(
      RoomCode.create(request.params.code ?? ''),
    );
    if (!room) {
      throw new RoomNotFoundError();
    }
    if (player.roomId !== room.id) {
      throw new ForbiddenError('Player does not belong to this room.');
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

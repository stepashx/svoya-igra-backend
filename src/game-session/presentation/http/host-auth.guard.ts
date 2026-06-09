import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { NotRoomHostError, RoomNotFoundError } from '../../domain/errors';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { RoomCode } from '../../domain/value-objects';
import { LobbyRequest } from './request-context';

/** Header carrying the host's reconnect/identity token. */
export const HOST_TOKEN_HEADER = 'x-host-token';

/**
 * Authorises host-only routes. Resolves the room from `:code` (invalid →
 * InvalidRoomCodeError 400, missing → RoomNotFoundError 404) and checks the
 * `X-Host-Token` header against the room's `hostReconnectToken` (absent or
 * mismatched → NotRoomHostError 403). On success it attaches `{ roomId, hostId }`
 * to the request for {@link CurrentHost}.
 */
@Injectable()
export class HostAuthGuard implements CanActivate {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<LobbyRequest>();
    const code = RoomCode.create(request.params.code ?? '');
    const room = await this.rooms.findByCode(code);
    if (!room) {
      throw new RoomNotFoundError();
    }

    const token = request.headers[HOST_TOKEN_HEADER];
    if (typeof token !== 'string' || token !== room.hostReconnectToken.value) {
      throw new NotRoomHostError();
    }

    request.hostContext = { roomId: room.id, hostId: room.hostId };
    return true;
  }
}

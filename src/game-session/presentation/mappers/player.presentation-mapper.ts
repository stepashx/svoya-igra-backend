import { Player } from '../../domain/entities';
import { PlayerIdentityResponseDto, PlayerResponseDto } from '../dto/response';

/** Player entity → public response DTO (no reconnect token). */
export function toPlayerResponse(player: Player): PlayerResponseDto {
  return {
    id: player.id,
    roomId: player.roomId,
    teamId: player.teamId,
    name: player.name.value,
    avatar: player.avatar,
    isCaptain: player.isCaptain,
    connectionStatus: player.connectionStatus,
    joinedAt: player.joinedAt.toISOString(),
    lastSeenAt: player.lastSeenAt.toISOString(),
  };
}

/** Player entity → owner response, exposing the reconnect token once. */
export function toPlayerIdentityResponse(
  player: Player,
): PlayerIdentityResponseDto {
  return {
    player: toPlayerResponse(player),
    reconnectToken: player.reconnectToken.value,
  };
}

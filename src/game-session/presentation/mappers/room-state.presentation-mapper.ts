import { RoomAggregateSnapshot } from '../../application/queries';
import { RoomStateResponseDto } from '../dto/response';
import { toPlayerResponse } from './player.presentation-mapper';
import { toRoomResponse } from './room.presentation-mapper';
import { toTeamResponse } from './team.presentation-mapper';

/** Room aggregate snapshot → full room-state response DTO. */
export function toRoomStateResponse(
  snapshot: RoomAggregateSnapshot,
): RoomStateResponseDto {
  return {
    room: toRoomResponse(snapshot.room),
    players: snapshot.players.map(toPlayerResponse),
    teams: snapshot.teams.map(toTeamResponse),
  };
}

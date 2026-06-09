import { ApiProperty } from '@nestjs/swagger';
import { PlayerResponseDto } from './player.response';
import { RoomResponseDto } from './room.response';
import { TeamResponseDto } from './team.response';

/** Full lobby snapshot: the room with its players and teams. */
export class RoomStateResponseDto {
  @ApiProperty({ type: RoomResponseDto })
  room!: RoomResponseDto;

  @ApiProperty({ type: [PlayerResponseDto] })
  players!: PlayerResponseDto[];

  @ApiProperty({ type: [TeamResponseDto] })
  teams!: TeamResponseDto[];
}

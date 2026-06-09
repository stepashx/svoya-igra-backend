import { ApiProperty } from '@nestjs/swagger';
import { PlayerResponseDto } from './player.response';

/** Public view of a team. */
export class TeamResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  roomId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  captainPlayerId!: string | null;

  @ApiProperty({ nullable: true })
  selectedTopicId!: string | null;

  @ApiProperty()
  isReady!: boolean;

  @ApiProperty({ nullable: true })
  turnOrder!: number | null;

  @ApiProperty()
  earnedScore!: number;

  @ApiProperty()
  balance!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;
}

/** A team together with its current members. */
export class TeamWithMembersResponseDto {
  @ApiProperty({ type: TeamResponseDto })
  team!: TeamResponseDto;

  @ApiProperty({ type: [PlayerResponseDto] })
  members!: PlayerResponseDto[];
}

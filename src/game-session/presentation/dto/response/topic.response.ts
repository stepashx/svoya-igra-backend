import { ApiProperty } from '@nestjs/swagger';

/** A catalog topic. */
export class TopicResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;
}

/** A catalog topic plus which team (if any) holds it in the room. */
export class RoomTopicResponseDto {
  @ApiProperty({ type: TopicResponseDto })
  topic!: TopicResponseDto;

  @ApiProperty({ nullable: true })
  takenByTeamId!: string | null;
}

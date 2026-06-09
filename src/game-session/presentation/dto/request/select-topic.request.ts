import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Body for PATCH /rooms/:code/teams/:teamId/topic. */
export class SelectTopicRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Catalog topic id to select.' })
  @IsUUID()
  topicId!: string;
}

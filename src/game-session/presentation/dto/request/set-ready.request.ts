import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Body for PATCH /rooms/:code/teams/:teamId/ready. */
export class SetReadyRequestDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isReady!: boolean;
}

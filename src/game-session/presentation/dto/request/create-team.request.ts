import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body for POST /rooms/:code/teams — mirrors the TeamName value object. */
export class CreateTeamRequestDto {
  @ApiProperty({ maxLength: 50, example: 'Red Team' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;
}

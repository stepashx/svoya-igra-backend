import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body for POST /rooms/:code/players — mirrors the PlayerName value object. */
export class JoinRoomRequestDto {
  @ApiProperty({ maxLength: 50, example: 'Alice' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;
}

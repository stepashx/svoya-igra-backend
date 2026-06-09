import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Body for PATCH /rooms/:code/players/me. Both fields are optional; omit to
 * leave unchanged. `avatar: null` clears the avatar. `name` mirrors the
 * PlayerName value object (the VO is the final source of truth).
 */
export class UpdateProfileRequestDto {
  @ApiPropertyOptional({ maxLength: 50, example: 'Alice' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ nullable: true, example: 'https://cdn/avatar.png' })
  @IsOptional()
  @IsString()
  avatar?: string | null;
}

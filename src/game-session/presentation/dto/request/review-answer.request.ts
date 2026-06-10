import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** Body for POST /rooms/:code/questions/review (host accepts/rejects). */
export class ReviewAnswerRequestDto {
  @ApiProperty({
    example: true,
    description: 'Whether the host accepts the submitted answer.',
  })
  @IsBoolean()
  accepted!: boolean;

  @ApiPropertyOptional({
    description:
      'Reveal the correct answer to the host (plan §14.6). Accepted in 6.2a ' +
      'but drives no extra delivery — the host reads the answer over REST.',
  })
  @IsOptional()
  @IsBoolean()
  revealAnswer?: boolean;
}

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
      'Reveal the correct answer to the host (plan §14.6). When true, the ' +
      'review additionally emits the host-only WS event ' +
      '`question-correct-answer-shown-to-host`; REST stays the source of truth.',
  })
  @IsOptional()
  @IsBoolean()
  revealAnswer?: boolean;
}

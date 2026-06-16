import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Body for POST /rooms/:code/evaluation/results (host). `force` opts past the
 * completeness gate (§14.10): omitted/false rejects an incomplete tally with 409
 * {@link EvaluationNotCompleteError}; `true` finishes the game deliberately on
 * whatever is confirmed so far.
 */
export class CalculateResultsRequestDto {
  @ApiPropertyOptional({
    description: 'Finish even if not every evaluation is confirmed.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

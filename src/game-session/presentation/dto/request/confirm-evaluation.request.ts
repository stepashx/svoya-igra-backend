import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Body for POST /rooms/:code/evaluation/{team,host}/confirm. `targetTeamId`
 * chooses the granularity (both branches are supported, §15.11): present →
 * per-target confirm (STRICT — 404 if no draft, 409 if already confirmed);
 * omitted → all-at-once, freezing this evaluator's remaining unconfirmed scores
 * (idempotent — skips already-confirmed rows).
 */
export class ConfirmEvaluationRequestDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Confirm a single team’s score; omit to confirm all remaining drafts.',
  })
  @IsOptional()
  @IsUUID()
  targetTeamId?: string;
}

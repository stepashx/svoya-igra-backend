import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID } from 'class-validator';

/**
 * Body for POST /rooms/:code/evaluation/{team,host} (a captain or the host
 * scores one team). The evaluator is NEVER in the body — it comes from the
 * player/host guard. The two scores are integers only here; the per-criterion
 * `[min, max]` range is validated in the use case against the seeded criteria
 * (NOT hard-coded `@Min/@Max`), so a criterion bound change needs no DTO edit.
 */
export class SubmitEvaluationRequestDto {
  @ApiProperty({ format: 'uuid', description: 'Team being evaluated.' })
  @IsUUID()
  targetTeamId!: string;

  @ApiProperty({
    description: 'Score for criterion order 0 ("Раскрытие темы").',
  })
  @IsInt()
  topicScore!: number;

  @ApiProperty({
    description: 'Score for criterion order 1 ("Дизайн презентации").',
  })
  @IsInt()
  designScore!: number;
}

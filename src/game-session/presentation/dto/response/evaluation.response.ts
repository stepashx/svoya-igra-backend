import { ApiProperty } from '@nestjs/swagger';

/**
 * A seeded evaluation criterion (plan §15.11) for the public `GET criteria`
 * list — what the UI renders the score inputs from. `order` is authoritative
 * (0 = "Раскрытие темы" → topicScore, 1 = "Дизайн презентации" → designScore).
 */
export class CriterionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  minScore!: number;

  @ApiProperty()
  maxScore!: number;

  @ApiProperty()
  order!: number;
}

/**
 * A team that can be evaluated (plan §15.11) for the public `GET teams` list —
 * the participants in defense order. Carries no scores (those are private until
 * results); just the id/name the evaluator picks from.
 */
export class EvaluationTargetResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  turnOrder!: number | null;
}

/** Submitted/confirmed/expected counts for one evaluator class — NO scores. */
export class ProgressCountsResponseDto {
  @ApiProperty()
  submitted!: number;

  @ApiProperty()
  confirmed!: number;

  @ApiProperty()
  expected!: number;
}

/**
 * The §15.11 evaluation progress — counts ONLY (§16.8 secrecy: the running
 * tallies stay numeric-score-free until results, 10.3). `complete` is derived
 * but never acted upon in 10.2.
 */
export class ProgressResponseDto {
  @ApiProperty({ description: 'Teams WITH a captain (the N in the N² total).' })
  teamCount!: number;

  @ApiProperty({ type: ProgressCountsResponseDto })
  team!: ProgressCountsResponseDto;

  @ApiProperty({ type: ProgressCountsResponseDto })
  host!: ProgressCountsResponseDto;

  @ApiProperty()
  totalExpected!: number;

  @ApiProperty()
  complete!: boolean;
}

/**
 * One evaluation score WITH its numbers (plan §15.11). The ONLY numeric surface
 * in 10.2 — returned exclusively as the author's echo of their OWN row in the
 * POST reply (§16.8 "intrigue"): broadcasts and progress never carry scores,
 * and there is no GET listing of another evaluator's scores until results.
 */
export class EvaluationScoreResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  targetTeamId!: string;

  @ApiProperty({ enum: ['TEAM', 'HOST'] })
  evaluatorType!: string;

  @ApiProperty({ nullable: true })
  evaluatorTeamId!: string | null;

  @ApiProperty()
  topicScore!: number;

  @ApiProperty()
  designScore!: number;

  @ApiProperty()
  totalScore!: number;

  @ApiProperty()
  weight!: number;

  @ApiProperty({ format: 'date-time', nullable: true })
  confirmedAt!: string | null;
}

/**
 * Reply to a successful `POST team` / `POST host` submit: the author's own score
 * echoed back (the numeric surface), whether it was a fresh create, and the
 * progress counts.
 */
export class SubmitEvaluationResponseDto {
  @ApiProperty({ type: EvaluationScoreResponseDto })
  score!: EvaluationScoreResponseDto;

  @ApiProperty()
  created!: boolean;

  @ApiProperty({ type: ProgressResponseDto })
  progress!: ProgressResponseDto;
}

/**
 * Reply to a `POST team/confirm` / `POST host/confirm`: the scores this call
 * froze (one for per-target, the remaining drafts for all-at-once, `[]` when
 * already idempotent) plus the progress counts.
 */
export class ConfirmEvaluationResponseDto {
  @ApiProperty({ type: [EvaluationScoreResponseDto] })
  confirmed!: EvaluationScoreResponseDto[];

  @ApiProperty({ type: ProgressResponseDto })
  progress!: ProgressResponseDto;
}

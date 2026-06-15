import { EvaluationProgress } from '../../../evaluation/application/queries';
import {
  EvaluationCriterion,
  EvaluationScore,
} from '../../../evaluation/domain/entities';
import {
  ConfirmEvaluationResult,
  SubmitEvaluationResult,
} from '../../application/use-cases';
import { Team } from '../../domain/entities';
import {
  ConfirmEvaluationResponseDto,
  CriterionResponseDto,
  EvaluationScoreResponseDto,
  EvaluationTargetResponseDto,
  ProgressResponseDto,
  SubmitEvaluationResponseDto,
} from '../dto/response';

/** Criterion entity → response DTO (public `GET criteria`). */
export function toCriterionResponse(
  criterion: EvaluationCriterion,
): CriterionResponseDto {
  return {
    id: criterion.id,
    title: criterion.title,
    description: criterion.description,
    minScore: criterion.minScore,
    maxScore: criterion.maxScore,
    order: criterion.order,
  };
}

/** Team entity → evaluation-target DTO (public `GET teams`; no scores). */
export function toEvaluationTargetResponse(
  team: Team,
): EvaluationTargetResponseDto {
  return {
    id: team.id,
    name: team.name.value,
    turnOrder: team.turnOrder,
  };
}

/** Progress view → counts-only DTO (§16.8 secrecy: no numeric scores). */
export function toProgressResponse(
  progress: EvaluationProgress,
): ProgressResponseDto {
  return {
    teamCount: progress.teamCount,
    team: { ...progress.team },
    host: { ...progress.host },
    totalExpected: progress.totalExpected,
    complete: progress.complete,
  };
}

/** Score entity → DTO WITH numbers — author's-own-row echo ONLY (§16.8). */
export function toEvaluationScoreResponse(
  score: EvaluationScore,
): EvaluationScoreResponseDto {
  return {
    id: score.id,
    targetTeamId: score.targetTeamId,
    evaluatorType: score.evaluatorType,
    evaluatorTeamId: score.evaluatorTeamId,
    topicScore: score.topicScore,
    designScore: score.designScore,
    totalScore: score.totalScore,
    weight: score.weight,
    confirmedAt: score.confirmedAt ? score.confirmedAt.toISOString() : null,
  };
}

/** Submit result → the author's reply (score echo + created + progress). */
export function toSubmitEvaluationResponse(
  result: SubmitEvaluationResult,
): SubmitEvaluationResponseDto {
  return {
    score: toEvaluationScoreResponse(result.score),
    created: result.created,
    progress: toProgressResponse(result.progress),
  };
}

/** Confirm result → the frozen scores + progress. */
export function toConfirmEvaluationResponse(
  result: ConfirmEvaluationResult,
): ConfirmEvaluationResponseDto {
  return {
    confirmed: result.confirmed.map(toEvaluationScoreResponse),
    progress: toProgressResponse(result.progress),
  };
}

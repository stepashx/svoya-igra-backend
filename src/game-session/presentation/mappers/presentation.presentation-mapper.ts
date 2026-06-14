import { PresentationRequirement } from '../../../presentation/domain/entities';
import { PresentationRequirementResponseDto } from '../dto/response';

/** Requirement entity → response DTO. Public (room-wide): no secret content. */
export function toPresentationRequirementResponse(
  requirement: PresentationRequirement,
): PresentationRequirementResponseDto {
  return {
    id: requirement.id,
    title: requirement.title,
    description: requirement.description,
    order: requirement.order,
    isRequired: requirement.isRequired,
  };
}

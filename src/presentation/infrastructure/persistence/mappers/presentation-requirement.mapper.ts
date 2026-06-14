import { presentationRequirements } from '../../../../infrastructure/database/schema';
import { PresentationRequirement } from '../../../domain/entities';

type PresentationRequirementRow = typeof presentationRequirements.$inferSelect;

/**
 * Row → entity. Requirements are read-only (a seed-managed catalog), so there is
 * no insert/update mapper — the seed owns writes.
 */
export function mapRowToPresentationRequirement(
  row: PresentationRequirementRow,
): PresentationRequirement {
  return PresentationRequirement.reconstitute({
    id: row.id,
    title: row.title,
    description: row.description,
    order: row.order,
    isRequired: row.isRequired,
  });
}

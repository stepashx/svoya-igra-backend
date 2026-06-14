import { PresentationRequirement } from '../entities';

/**
 * Persistence port for the global presentation-requirements catalog (plan
 * §15.10) — read-only and seed-managed, exactly like
 * {@link ShopItemRepositoryPort}. The Drizzle adapter lists requirements in
 * display order.
 */
export interface PresentationRequirementRepositoryPort {
  listAll(): Promise<PresentationRequirement[]>;
}

export const PRESENTATION_REQUIREMENT_REPOSITORY_PORT = Symbol(
  'PresentationRequirementRepositoryPort',
);

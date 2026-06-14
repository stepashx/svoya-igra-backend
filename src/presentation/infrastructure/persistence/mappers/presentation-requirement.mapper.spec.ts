import { presentationRequirements } from '../../../../infrastructure/database/schema';
import { mapRowToPresentationRequirement } from './presentation-requirement.mapper';

describe('presentation-requirement.mapper', () => {
  it('maps a row to a requirement entity', () => {
    const row: typeof presentationRequirements.$inferSelect = {
      id: 'req-1',
      title: 'Условие 1',
      description: 'Описание условия 1',
      order: 0,
      isRequired: true,
    };
    const requirement = mapRowToPresentationRequirement(row);
    expect(requirement.id).toBe('req-1');
    expect(requirement.title).toBe('Условие 1');
    expect(requirement.description).toBe('Описание условия 1');
    expect(requirement.order).toBe(0);
    expect(requirement.isRequired).toBe(true);
  });

  it('carries a null description through', () => {
    const row: typeof presentationRequirements.$inferSelect = {
      id: 'req-2',
      title: 'Условие 4',
      description: null,
      order: 3,
      isRequired: false,
    };
    expect(mapRowToPresentationRequirement(row).description).toBeNull();
  });
});

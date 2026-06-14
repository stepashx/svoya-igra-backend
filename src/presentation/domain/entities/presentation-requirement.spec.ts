import { PresentationRequirement } from './presentation-requirement';

describe('PresentationRequirement', () => {
  it('reconstitutes and exposes every field through getters', () => {
    const requirement = PresentationRequirement.reconstitute({
      id: 'req-1',
      title: 'Условие 1',
      description: 'Описание условия 1',
      order: 0,
      isRequired: true,
    });
    expect(requirement.id).toBe('req-1');
    expect(requirement.title).toBe('Условие 1');
    expect(requirement.description).toBe('Описание условия 1');
    expect(requirement.order).toBe(0);
    expect(requirement.isRequired).toBe(true);
  });

  it('carries a null description and an optional requirement', () => {
    const requirement = PresentationRequirement.reconstitute({
      id: 'req-2',
      title: 'Условие 4',
      description: null,
      order: 3,
      isRequired: false,
    });
    expect(requirement.description).toBeNull();
    expect(requirement.isRequired).toBe(false);
  });
});

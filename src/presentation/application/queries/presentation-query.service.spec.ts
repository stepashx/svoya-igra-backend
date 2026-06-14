import { PresentationRequirement } from '../../domain/entities';
import { PresentationRequirementRepositoryPort } from '../../domain/ports';
import { PresentationQueryService } from './presentation-query.service';

describe('PresentationQueryService', () => {
  const makeRequirement = (
    id: string,
    order: number,
  ): PresentationRequirement =>
    PresentationRequirement.reconstitute({
      id,
      title: `Условие ${id}`,
      description: null,
      order,
      isRequired: true,
    });

  it('delegates listRequirements to the repository', async () => {
    const requirements = [
      makeRequirement('req-1', 0),
      makeRequirement('req-2', 1),
    ];
    const repo: jest.Mocked<PresentationRequirementRepositoryPort> = {
      listAll: jest.fn().mockResolvedValue(requirements),
    };
    const service = new PresentationQueryService(repo);

    const result = await service.listRequirements();

    expect(repo.listAll).toHaveBeenCalledTimes(1);
    expect(result).toBe(requirements);
  });
});

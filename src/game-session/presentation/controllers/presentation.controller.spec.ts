import { NotImplementedException } from '@nestjs/common';
import { PresentationQueryService } from '../../../presentation/application/queries';
import { PresentationRequirement } from '../../../presentation/domain/entities';
import { LobbyQueryService } from '../../application/queries';
import { makeRoom } from '../../application/use-cases/lobby-test-doubles';
import { PresentationController } from './presentation.controller';

describe('PresentationController', () => {
  const build = () => {
    const presentationQuery = {
      listRequirements: jest.fn(),
    } as unknown as jest.Mocked<PresentationQueryService>;
    const lobby = {
      getRoom: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const controller = new PresentationController(presentationQuery, lobby);
    return { controller, presentationQuery, lobby };
  };

  it('lists the requirements as mapped DTOs after validating the room (9.1)', async () => {
    const { controller, presentationQuery, lobby } = build();
    lobby.getRoom.mockResolvedValue(makeRoom({ id: 'room-1' }));
    presentationQuery.listRequirements.mockResolvedValue([
      PresentationRequirement.reconstitute({
        id: 'req-1',
        title: 'Условие 1',
        description: 'Описание условия 1',
        order: 0,
        isRequired: true,
      }),
      PresentationRequirement.reconstitute({
        id: 'req-2',
        title: 'Условие 4',
        description: null,
        order: 3,
        isRequired: false,
      }),
    ]);

    const res = await controller.listRequirements('ABCDEF');

    expect(lobby.getRoom).toHaveBeenCalledWith('ABCDEF');
    expect(presentationQuery.listRequirements).toHaveBeenCalledTimes(1);
    expect(res).toEqual([
      {
        id: 'req-1',
        title: 'Условие 1',
        description: 'Описание условия 1',
        order: 0,
        isRequired: true,
      },
      {
        id: 'req-2',
        title: 'Условие 4',
        description: null,
        order: 3,
        isRequired: false,
      },
    ]);
  });

  it('returns 501 for the deferred preparation + upload surface (9.2/9.3)', () => {
    const { controller } = build();
    expect(() => controller.getDeadline()).toThrow(NotImplementedException);
    expect(() => controller.getSubmissions()).toThrow(NotImplementedException);
    expect(() => controller.upload()).toThrow(NotImplementedException);
    expect(() => controller.replace()).toThrow(NotImplementedException);
    expect(() => controller.getFiles()).toThrow(NotImplementedException);
  });
});

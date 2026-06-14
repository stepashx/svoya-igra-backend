import { NotImplementedException } from '@nestjs/common';
import { PresentationQueryService } from '../../../presentation/application/queries';
import {
  PresentationRequirement,
  PresentationSubmission,
} from '../../../presentation/domain/entities';
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import { StartPresentationPreparationUseCase } from '../../application/use-cases';
import { makeRoom } from '../../application/use-cases/lobby-test-doubles';
import { PresentationController } from './presentation.controller';

describe('PresentationController', () => {
  const startedAt = new Date('2026-06-14T12:00:00.000Z');
  const endsAt = new Date('2026-06-14T12:10:00.000Z');

  const build = () => {
    const presentationQuery = {
      listRequirements: jest.fn(),
      listSubmissions: jest.fn(),
    } as unknown as jest.Mocked<PresentationQueryService>;
    const lobby = {
      getRoom: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const timers = {
      readPresentation: jest.fn(),
    } as unknown as jest.Mocked<TimerQueryService>;
    const startPresentationPreparation = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<StartPresentationPreparationUseCase>;
    const controller = new PresentationController(
      presentationQuery,
      lobby,
      timers,
      startPresentationPreparation,
    );
    return {
      controller,
      presentationQuery,
      lobby,
      timers,
      startPresentationPreparation,
    };
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

  it('maps the preparation timer state to the deadline DTO (9.2)', async () => {
    const { controller, timers } = build();
    timers.readPresentation.mockResolvedValue({
      status: 'RUNNING',
      startedAt,
      endsAt,
      remainingMs: 600_000,
    });

    const res = await controller.getDeadline('ABCDEF');

    expect(timers.readPresentation).toHaveBeenCalledWith('ABCDEF');
    expect(res).toEqual({
      status: 'RUNNING',
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      remainingMs: 600_000,
    });
  });

  it('starts preparation for the host room and maps the result timer to a DTO (9.2)', async () => {
    const { controller, startPresentationPreparation } = build();
    startPresentationPreparation.execute.mockResolvedValue({
      timer: { status: 'RUNNING', startedAt, endsAt, remainingMs: 600_000 },
    });

    const res = await controller.startPreparation({
      roomId: 'room-1',
      hostId: 'host-1',
    });

    expect(startPresentationPreparation.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
    });
    expect(res).toEqual({
      status: 'RUNNING',
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      remainingMs: 600_000,
    });
  });

  it('returns an empty submission list when no team has uploaded (9.2)', async () => {
    const { controller, presentationQuery, lobby } = build();
    lobby.getRoom.mockResolvedValue(makeRoom({ id: 'room-1' }));
    presentationQuery.listSubmissions.mockResolvedValue([]);

    const res = await controller.getSubmissions('ABCDEF');

    expect(lobby.getRoom).toHaveBeenCalledWith('ABCDEF');
    expect(presentationQuery.listSubmissions).toHaveBeenCalledWith('room-1');
    expect(res).toEqual([]);
  });

  it('maps each submission to a public status DTO (publicUrl included, 9.2)', async () => {
    const { controller, presentationQuery, lobby } = build();
    lobby.getRoom.mockResolvedValue(makeRoom({ id: 'room-1' }));
    const uploadedAt = new Date('2026-06-14T12:05:00.000Z');
    presentationQuery.listSubmissions.mockResolvedValue([
      PresentationSubmission.reconstitute({
        id: 'sub-1',
        roomId: 'room-1',
        teamId: 'team-1',
        uploadedByPlayerId: 'player-1',
        originalFileName: 'deck.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        storageProvider: 'minio',
        bucket: 'presentations',
        storageKey: 'room-1/team-1.pdf',
        publicUrl: 'https://cdn.example/room-1/team-1.pdf',
        uploadedAt,
        deadlineAt: new Date('2026-06-14T12:10:00.000Z'),
        isLate: false,
        latePenalty: 0,
        status: 'UPLOADED',
      }),
    ]);

    const res = await controller.getSubmissions('ABCDEF');

    expect(res).toEqual([
      {
        teamId: 'team-1',
        status: 'UPLOADED',
        isLate: false,
        uploadedAt: uploadedAt.toISOString(),
        publicUrl: 'https://cdn.example/room-1/team-1.pdf',
      },
    ]);
  });

  it('returns 501 for the deferred upload + files surface (9.3)', () => {
    const { controller } = build();
    expect(() => controller.upload()).toThrow(NotImplementedException);
    expect(() => controller.replace()).toThrow(NotImplementedException);
    expect(() => controller.getFiles()).toThrow(NotImplementedException);
  });
});

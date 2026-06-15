import { PresentationQueryService } from '../../../presentation/application/queries';
import {
  PresentationRequirement,
  PresentationSubmission,
} from '../../../presentation/domain/entities';
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import {
  StartPresentationPreparationUseCase,
  UploadPresentationUseCase,
} from '../../application/use-cases';
import { makeRoom } from '../../application/use-cases/lobby-test-doubles';
import { Player } from '../../domain/entities';
import { PresentationController } from './presentation.controller';

describe('PresentationController', () => {
  const startedAt = new Date('2026-06-14T12:00:00.000Z');
  const endsAt = new Date('2026-06-14T12:10:00.000Z');

  const makeSubmission = (
    overrides: Partial<{
      isLate: boolean;
      latePenalty: number;
      status: 'UPLOADED' | 'LATE';
    }> = {},
  ) =>
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
      storageKey: 'rooms/room-1/presentations/team-1/sub-1.pdf',
      publicUrl: 'https://cdn.example/room-1/team-1.pdf',
      uploadedAt: new Date('2026-06-14T12:05:00.000Z'),
      deadlineAt: new Date('2026-06-14T12:10:00.000Z'),
      isLate: overrides.isLate ?? false,
      latePenalty: overrides.latePenalty ?? 0,
      status: overrides.status ?? 'UPLOADED',
    });

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
    const uploadPresentation = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UploadPresentationUseCase>;
    const controller = new PresentationController(
      presentationQuery,
      lobby,
      timers,
      startPresentationPreparation,
      uploadPresentation,
    );
    return {
      controller,
      presentationQuery,
      lobby,
      timers,
      startPresentationPreparation,
      uploadPresentation,
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

  it('maps each submission to a public status DTO with the 9.3 metadata', async () => {
    const { controller, presentationQuery, lobby } = build();
    lobby.getRoom.mockResolvedValue(makeRoom({ id: 'room-1' }));
    presentationQuery.listSubmissions.mockResolvedValue([makeSubmission()]);

    const res = await controller.getSubmissions('ABCDEF');

    expect(res).toEqual([
      {
        teamId: 'team-1',
        status: 'UPLOADED',
        isLate: false,
        uploadedAt: '2026-06-14T12:05:00.000Z',
        publicUrl: 'https://cdn.example/room-1/team-1.pdf',
        originalFileName: 'deck.pdf',
        fileSize: 2048,
        latePenalty: 0,
      },
    ]);
  });

  it('lists files as public file DTOs (9.3)', async () => {
    const { controller, presentationQuery, lobby } = build();
    lobby.getRoom.mockResolvedValue(makeRoom({ id: 'room-1' }));
    presentationQuery.listSubmissions.mockResolvedValue([makeSubmission()]);

    const res = await controller.getFiles('ABCDEF');

    expect(presentationQuery.listSubmissions).toHaveBeenCalledWith('room-1');
    expect(res).toEqual([
      {
        teamId: 'team-1',
        originalFileName: 'deck.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        publicUrl: 'https://cdn.example/room-1/team-1.pdf',
        status: 'UPLOADED',
        isLate: false,
        uploadedAt: '2026-06-14T12:05:00.000Z',
      },
    ]);
  });

  it('uploads via the use case and maps the result to the captain reply (9.3)', async () => {
    const { controller, uploadPresentation } = build();
    const submission = makeSubmission();
    uploadPresentation.execute.mockResolvedValue({
      submission,
      publicUrl: submission.publicUrl,
      isCreate: true,
    });
    const player = { id: 'player-1', roomId: 'room-1' } as Player;
    const file = {
      originalname: 'deck.pdf',
      mimetype: 'application/pdf',
      size: 2048,
      buffer: Buffer.from('%PDF-1.4'),
    } as Express.Multer.File;

    const res = await controller.upload(player, file);

    expect(uploadPresentation.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      actingPlayerId: 'player-1',
      file: {
        originalFileName: 'deck.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        buffer: file.buffer,
      },
    });
    expect(res).toEqual({
      isCreate: true,
      teamId: 'team-1',
      originalFileName: 'deck.pdf',
      mimeType: 'application/pdf',
      fileSize: 2048,
      status: 'UPLOADED',
      isLate: false,
      latePenalty: 0,
      uploadedAt: '2026-06-14T12:05:00.000Z',
      publicUrl: submission.publicUrl,
    });
  });

  it('replace delegates to the same upload use case and reports isCreate=false (9.3)', async () => {
    const { controller, uploadPresentation } = build();
    const submission = makeSubmission({
      isLate: true,
      latePenalty: 1,
      status: 'LATE',
    });
    uploadPresentation.execute.mockResolvedValue({
      submission,
      publicUrl: submission.publicUrl,
      isCreate: false,
    });
    const player = { id: 'player-1', roomId: 'room-1' } as Player;
    const file = {
      originalname: 'deck.pdf',
      mimetype: 'application/pdf',
      size: 4096,
      buffer: Buffer.from('%PDF-1.7'),
    } as Express.Multer.File;

    const res = await controller.replace(player, file);

    expect(uploadPresentation.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      actingPlayerId: 'player-1',
      file: {
        originalFileName: 'deck.pdf',
        mimeType: 'application/pdf',
        fileSize: 4096,
        buffer: file.buffer,
      },
    });
    expect(res).toMatchObject({
      isCreate: false,
      status: 'LATE',
      isLate: true,
      latePenalty: 1,
    });
  });
});

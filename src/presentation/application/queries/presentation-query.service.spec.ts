import {
  PresentationRequirement,
  PresentationSubmission,
} from '../../domain/entities';
import {
  PresentationRequirementRepositoryPort,
  PresentationSubmissionRepositoryPort,
} from '../../domain/ports';
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

  const makeSubmission = (teamId: string): PresentationSubmission =>
    PresentationSubmission.reconstitute({
      id: `sub-${teamId}`,
      roomId: 'room-1',
      teamId,
      uploadedByPlayerId: 'player-1',
      originalFileName: 'deck.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
      storageProvider: 'minio',
      bucket: 'presentations',
      storageKey: `room-1/${teamId}.pdf`,
      publicUrl: `https://cdn.example/room-1/${teamId}.pdf`,
      uploadedAt: new Date('2026-06-14T12:00:00.000Z'),
      deadlineAt: new Date('2026-06-14T12:10:00.000Z'),
      isLate: false,
      latePenalty: 0,
      status: 'UPLOADED',
    });

  const makeRequirementRepo = (
    requirements: PresentationRequirement[] = [],
  ): jest.Mocked<PresentationRequirementRepositoryPort> => ({
    listAll: jest.fn().mockResolvedValue(requirements),
  });

  const makeSubmissionRepo = (
    submissions: PresentationSubmission[] = [],
  ): jest.Mocked<PresentationSubmissionRepositoryPort> => ({
    create: jest.fn().mockResolvedValue(undefined),
    findByRoomAndTeam: jest.fn().mockResolvedValue(null),
    findByRoomId: jest.fn().mockResolvedValue(submissions),
  });

  it('delegates listRequirements to the requirement repository', async () => {
    const requirements = [
      makeRequirement('req-1', 0),
      makeRequirement('req-2', 1),
    ];
    const requirementRepo = makeRequirementRepo(requirements);
    const service = new PresentationQueryService(
      requirementRepo,
      makeSubmissionRepo(),
    );

    const result = await service.listRequirements();

    expect(requirementRepo.listAll).toHaveBeenCalledTimes(1);
    expect(result).toBe(requirements);
  });

  it('delegates listSubmissions to the submission repository (by roomId)', async () => {
    const submissions = [makeSubmission('team-1'), makeSubmission('team-2')];
    const submissionRepo = makeSubmissionRepo(submissions);
    const service = new PresentationQueryService(
      makeRequirementRepo(),
      submissionRepo,
    );

    const result = await service.listSubmissions('room-1');

    expect(submissionRepo.findByRoomId).toHaveBeenCalledWith('room-1');
    expect(result).toBe(submissions);
  });
});

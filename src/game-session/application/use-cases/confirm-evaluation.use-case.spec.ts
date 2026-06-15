import { EvaluationQueryService } from '../../../evaluation/application/queries';
import { EvaluationScore } from '../../../evaluation/domain/entities';
import {
  EvaluationAlreadyConfirmedError,
  EvaluationNotFoundError,
} from '../../../evaluation/domain/errors';
import {
  EvaluationCriterionRepositoryPort,
  EvaluationScoreRepositoryPort,
} from '../../../evaluation/domain/ports';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { EvaluationEvent } from '../events';
import { ConfirmEvaluationUseCase } from './confirm-evaluation.use-case';
import {
  FIXED_NOW,
  makeClock,
  makePlayer,
  makePlayerRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('ConfirmEvaluationUseCase', () => {
  const draft = (
    overrides: Partial<{
      id: string;
      target: string;
      type: 'TEAM' | 'HOST';
      evaluatorTeamId: string | null;
      hostId: string | null;
    }> = {},
  ): EvaluationScore =>
    EvaluationScore.create({
      id: overrides.id ?? 'score-1',
      roomId: 'room-1',
      targetTeamId: overrides.target ?? 'team-2',
      evaluatorType: overrides.type ?? 'TEAM',
      evaluatorTeamId:
        overrides.evaluatorTeamId === undefined
          ? 'team-1'
          : overrides.evaluatorTeamId,
      hostId: overrides.hostId ?? null,
      topicScore: 5,
      designScore: 5,
    });

  const makeScoreRepo = (
    rows: EvaluationScore[] = [],
    found: EvaluationScore | null = null,
  ): jest.Mocked<EvaluationScoreRepositoryPort> => ({
    create: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    findByRoomTargetEvaluator: jest.fn().mockResolvedValue(found),
    findByRoomId: jest.fn().mockResolvedValue(rows),
  });

  const makeCriterionRepo =
    (): jest.Mocked<EvaluationCriterionRepositoryPort> => ({
      listAll: jest.fn().mockResolvedValue([]),
    });

  const setup = (
    scoreRepo: jest.Mocked<EvaluationScoreRepositoryPort>,
    roomStage = 'EVALUATION',
  ) => {
    const room = makeRoom({
      id: 'room-1',
      hostId: 'host-1',
      currentStage: roomStage as never,
    });
    const evaluatorTeam = makeTeam({
      id: 'team-1',
      captainPlayerId: 'player-1',
      turnOrder: 0,
    });
    const targetTeam = makeTeam({
      id: 'team-2',
      captainPlayerId: 'player-2',
      turnOrder: 1,
    });
    const rooms = makeRoomRepo();
    rooms.findById.mockResolvedValue(room);
    const players = makePlayerRepo();
    players.findById.mockResolvedValue(
      makePlayer({ id: 'player-1', teamId: 'team-1', isCaptain: true }),
    );
    const teams = makeTeamRepo();
    teams.findById.mockImplementation((id) =>
      Promise.resolve(
        id === 'team-1' ? evaluatorTeam : id === 'team-2' ? targetTeam : null,
      ),
    );
    teams.findByRoomId.mockResolvedValue([evaluatorTeam, targetTeam]);
    const realtime = makeRealtime();
    const useCase = new ConfirmEvaluationUseCase(
      makeTransactionPort(),
      rooms,
      teams,
      players,
      scoreRepo,
      makeClock(),
      realtime,
      new EvaluationQueryService(scoreRepo, makeCriterionRepo()),
    );
    return { useCase, scoreRepo, realtime, rooms };
  };

  const teamEvaluator = { type: 'TEAM' as const, actingPlayerId: 'player-1' };

  describe('per-target', () => {
    it('freezes the named draft, emits score-confirmed + progress-updated', async () => {
      const scoreRepo = makeScoreRepo([], draft());
      const { useCase, realtime } = setup(scoreRepo);

      const result = await useCase.execute({
        roomId: 'room-1',
        evaluator: teamEvaluator,
        targetTeamId: 'team-2',
      });

      expect(result.confirmed).toHaveLength(1);
      expect(result.confirmed[0].confirmedAt).toEqual(FIXED_NOW);
      expect(scoreRepo.update).toHaveBeenCalledTimes(1);
      const names = realtime.emitToRoom.mock.calls.map((c) => c[1]);
      expect(names).toEqual([
        EvaluationEvent.ScoreConfirmed,
        EvaluationEvent.ProgressUpdated,
      ]);
      const confirmedPayload = realtime.emitToRoom.mock.calls[0][2] as Record<
        string,
        unknown
      >;
      expect(confirmedPayload).not.toHaveProperty('totalScore');
      expect(confirmedPayload).toMatchObject({
        targetTeamId: 'team-2',
        evaluatorType: 'TEAM',
        evaluatorTeamId: 'team-1',
      });
    });

    it('rejects with EvaluationNotFoundError (404) when there is no draft', async () => {
      const { useCase } = setup(makeScoreRepo([], null));
      await expect(
        useCase.execute({
          roomId: 'room-1',
          evaluator: teamEvaluator,
          targetTeamId: 'team-2',
        }),
      ).rejects.toBeInstanceOf(EvaluationNotFoundError);
    });

    it('rejects re-confirming an already-confirmed row with 409', async () => {
      const confirmed = draft().confirm(FIXED_NOW);
      const { useCase, scoreRepo } = setup(makeScoreRepo([], confirmed));
      await expect(
        useCase.execute({
          roomId: 'room-1',
          evaluator: teamEvaluator,
          targetTeamId: 'team-2',
        }),
      ).rejects.toBeInstanceOf(EvaluationAlreadyConfirmedError);
      expect(scoreRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('all-at-once', () => {
    it('freezes only this evaluator’s UNCONFIRMED rows, skipping confirmed ones', async () => {
      // Two of this captain's targets: one already confirmed (per-target), one
      // still a draft. Plus a host row and another team's row — both untouched.
      const alreadyConfirmed = draft({ id: 's-A', target: 'team-2' }).confirm(
        FIXED_NOW,
      );
      const stillDraft = draft({ id: 's-B', target: 'team-3' });
      const hostRow = draft({
        id: 's-host',
        type: 'HOST',
        evaluatorTeamId: null,
        hostId: 'host-1',
      });
      const otherTeamRow = draft({
        id: 's-other',
        evaluatorTeamId: 'team-9',
      });
      const scoreRepo = makeScoreRepo([
        alreadyConfirmed,
        stillDraft,
        hostRow,
        otherTeamRow,
      ]);
      const { useCase, realtime } = setup(scoreRepo);

      const result = await useCase.execute({
        roomId: 'room-1',
        evaluator: teamEvaluator,
      });

      // Only the single still-draft row of THIS captain is frozen.
      expect(result.confirmed.map((s) => s.id)).toEqual(['s-B']);
      expect(scoreRepo.update).toHaveBeenCalledTimes(1);
      const names = realtime.emitToRoom.mock.calls.map((c) => c[1]);
      expect(names).toEqual([
        EvaluationEvent.ScoreConfirmed,
        EvaluationEvent.ProgressUpdated,
      ]);
    });

    it('is idempotent when nothing is left to freeze (returns [], no events)', async () => {
      const allConfirmed = [
        draft({ id: 's-A', target: 'team-2' }).confirm(FIXED_NOW),
        draft({ id: 's-B', target: 'team-3' }).confirm(FIXED_NOW),
      ];
      const scoreRepo = makeScoreRepo(allConfirmed);
      const { useCase, realtime } = setup(scoreRepo);

      const result = await useCase.execute({
        roomId: 'room-1',
        evaluator: teamEvaluator,
      });

      expect(result.confirmed).toEqual([]);
      expect(scoreRepo.update).not.toHaveBeenCalled();
      expect(realtime.emitToRoom).not.toHaveBeenCalled();
    });
  });

  it('rejects confirming outside EVALUATION with UnexpectedGameStageError (409)', async () => {
    const { useCase } = setup(makeScoreRepo([], draft()), 'GAME_BOARD');
    await expect(
      useCase.execute({
        roomId: 'room-1',
        evaluator: teamEvaluator,
        targetTeamId: 'team-2',
      }),
    ).rejects.toBeInstanceOf(UnexpectedGameStageError);
  });
});

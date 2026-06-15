import { EvaluationQueryService } from '../../../evaluation/application/queries';
import {
  EvaluationCriterion,
  EvaluationScore,
} from '../../../evaluation/domain/entities';
import {
  EvaluationAlreadyConfirmedError,
  EvaluationAlreadySubmittedError,
  ScoreOutOfRangeError,
  SelfEvaluationError,
  TargetTeamNotFoundError,
} from '../../../evaluation/domain/errors';
import {
  EvaluationCriterionRepositoryPort,
  EvaluationScoreRepositoryPort,
} from '../../../evaluation/domain/ports';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { NotTeamCaptainError } from '../../domain/errors';
import { EvaluationEvent } from '../events';
import {
  makeIdGenerator,
  makePlayer,
  makeRealtime,
  makeRoom,
  makePlayerRepo,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTransactionPort,
} from './lobby-test-doubles';
import { SubmitEvaluationUseCase } from './submit-evaluation.use-case';

describe('SubmitEvaluationUseCase', () => {
  const criteria = [
    EvaluationCriterion.reconstitute({
      id: 'c-topic',
      title: 'Раскрытие темы',
      description: null,
      minScore: 0,
      maxScore: 10,
      order: 0,
    }),
    EvaluationCriterion.reconstitute({
      id: 'c-design',
      title: 'Дизайн презентации',
      description: null,
      minScore: 0,
      maxScore: 10,
      order: 1,
    }),
  ];

  const makeScoreRepo = (): jest.Mocked<EvaluationScoreRepositoryPort> => ({
    create: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    findByRoomTargetEvaluator: jest.fn().mockResolvedValue(null),
    findByRoomId: jest.fn().mockResolvedValue([]),
  });

  const makeCriterionRepo = (
    rows: EvaluationCriterion[] = criteria,
  ): jest.Mocked<EvaluationCriterionRepositoryPort> => ({
    listAll: jest.fn().mockResolvedValue(rows),
  });

  /** Build the use case with overridable doubles; defaults reach a TEAM happy path. */
  const setup = (
    options: {
      roomStage?: string;
      evaluatorTeam?: ReturnType<typeof makeTeam>;
      targetTeam?: ReturnType<typeof makeTeam>;
      player?: ReturnType<typeof makePlayer>;
      scoreRepo?: jest.Mocked<EvaluationScoreRepositoryPort>;
      criterionRepo?: jest.Mocked<EvaluationCriterionRepositoryPort>;
    } = {},
  ) => {
    const room = makeRoom({
      id: 'room-1',
      hostId: 'host-1',
      currentStage: (options.roomStage ?? 'EVALUATION') as never,
    });
    const evaluatorTeam =
      options.evaluatorTeam ??
      makeTeam({ id: 'team-1', captainPlayerId: 'player-1', turnOrder: 0 });
    const targetTeam =
      options.targetTeam ??
      makeTeam({ id: 'team-2', captainPlayerId: 'player-2', turnOrder: 1 });
    const player =
      options.player ??
      makePlayer({ id: 'player-1', teamId: 'team-1', isCaptain: true });

    const rooms = makeRoomRepo();
    rooms.findById.mockResolvedValue(room);
    const players = makePlayerRepo();
    players.findById.mockResolvedValue(player);
    const teams = makeTeamRepo();
    teams.findById.mockImplementation((id) =>
      Promise.resolve(
        id === evaluatorTeam.id
          ? evaluatorTeam
          : id === targetTeam.id
            ? targetTeam
            : null,
      ),
    );
    teams.findByRoomId.mockResolvedValue([evaluatorTeam, targetTeam]);

    const scoreRepo = options.scoreRepo ?? makeScoreRepo();
    const criterionRepo = options.criterionRepo ?? makeCriterionRepo();
    const realtime = makeRealtime();
    const useCase = new SubmitEvaluationUseCase(
      makeTransactionPort(),
      rooms,
      teams,
      players,
      scoreRepo,
      criterionRepo,
      makeIdGenerator('score'),
      realtime,
      new EvaluationQueryService(scoreRepo, criterionRepo),
    );
    return { useCase, rooms, teams, players, scoreRepo, realtime };
  };

  const teamInput = {
    roomId: 'room-1',
    targetTeamId: 'team-2',
    topicScore: 7,
    designScore: 5,
    evaluator: { type: 'TEAM' as const, actingPlayerId: 'player-1' },
  };

  it('records a TEAM vote: weight 1, total = topic + design, created, lock first', async () => {
    const { useCase, rooms, scoreRepo, realtime } = setup();

    const result = await useCase.execute(teamInput);

    expect(rooms.acquireRoomLock).toHaveBeenCalledWith('room-1');
    expect(result.created).toBe(true);
    expect(result.score.weight).toBe(1);
    expect(result.score.totalScore).toBe(12);
    expect(result.score.evaluatorTeamId).toBe('team-1');
    expect(result.score.hostId).toBeNull();
    expect(scoreRepo.create).toHaveBeenCalledTimes(1);
    expect(scoreRepo.update).not.toHaveBeenCalled();
    // score-submitted then progress-updated, NEITHER carrying numeric scores.
    const events = realtime.emitToRoom.mock.calls.map((c) => c[1]);
    expect(events).toEqual([
      EvaluationEvent.ScoreSubmitted,
      EvaluationEvent.ProgressUpdated,
    ]);
    const submittedPayload = realtime.emitToRoom.mock.calls[0][2] as Record<
      string,
      unknown
    >;
    expect(submittedPayload).not.toHaveProperty('topicScore');
    expect(submittedPayload).not.toHaveProperty('designScore');
    expect(submittedPayload).not.toHaveProperty('totalScore');
    expect(submittedPayload).toMatchObject({
      targetTeamId: 'team-2',
      evaluatorType: 'TEAM',
      evaluatorTeamId: 'team-1',
      created: true,
    });
  });

  it('records a HOST vote: weight 2, evaluatorTeamId null, hostId = room.hostId', async () => {
    const { useCase, scoreRepo } = setup();

    const result = await useCase.execute({
      roomId: 'room-1',
      targetTeamId: 'team-2',
      topicScore: 8,
      designScore: 6,
      evaluator: { type: 'HOST' },
    });

    expect(result.score.weight).toBe(2);
    expect(result.score.evaluatorTeamId).toBeNull();
    expect(result.score.hostId).toBe('host-1');
    expect(result.score.totalScore).toBe(14);
    expect(scoreRepo.create).toHaveBeenCalledTimes(1);
  });

  it('rejects self-evaluation with SelfEvaluationError BEFORE persistence (403)', async () => {
    const { useCase, scoreRepo } = setup();
    await expect(
      useCase.execute({ ...teamInput, targetTeamId: 'team-1' }),
    ).rejects.toBeInstanceOf(SelfEvaluationError);
    expect(scoreRepo.create).not.toHaveBeenCalled();
    expect(scoreRepo.update).not.toHaveBeenCalled();
  });

  it('rejects a non-captain TEAM vote with NotTeamCaptainError (403)', async () => {
    const { useCase } = setup({
      evaluatorTeam: makeTeam({
        id: 'team-1',
        captainPlayerId: 'someone-else',
      }),
    });
    await expect(useCase.execute(teamInput)).rejects.toBeInstanceOf(
      NotTeamCaptainError,
    );
  });

  it('rejects a TEAM captain from ANOTHER room (symmetric cross-tenant guard)', async () => {
    const { useCase } = setup({
      evaluatorTeam: makeTeam({
        id: 'team-1',
        roomId: 'other-room',
        captainPlayerId: 'player-1',
      }),
    });
    await expect(useCase.execute(teamInput)).rejects.toBeInstanceOf(
      NotTeamCaptainError,
    );
  });

  it('rejects a target team from another room with TargetTeamNotFoundError (404)', async () => {
    const { useCase } = setup({
      targetTeam: makeTeam({ id: 'team-2', roomId: 'other-room' }),
    });
    await expect(useCase.execute(teamInput)).rejects.toBeInstanceOf(
      TargetTeamNotFoundError,
    );
  });

  it('rejects submitting outside EVALUATION with UnexpectedGameStageError (409)', async () => {
    const { useCase } = setup({ roomStage: 'GAME_BOARD' });
    await expect(useCase.execute(teamInput)).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
  });

  it('rejects a score out of the criterion range with ScoreOutOfRangeError (409)', async () => {
    const { useCase } = setup();
    await expect(
      useCase.execute({ ...teamInput, topicScore: 11 }),
    ).rejects.toBeInstanceOf(ScoreOutOfRangeError);
  });

  it('updates (not creates) an existing UNCONFIRMED TEAM score (re-evaluation)', async () => {
    const scoreRepo = makeScoreRepo();
    const existing = EvaluationScore.create({
      id: 'existing-1',
      roomId: 'room-1',
      targetTeamId: 'team-2',
      evaluatorType: 'TEAM',
      evaluatorTeamId: 'team-1',
      hostId: null,
      topicScore: 1,
      designScore: 1,
    });
    scoreRepo.findByRoomTargetEvaluator.mockResolvedValue(existing);
    const { useCase } = setup({ scoreRepo });

    const result = await useCase.execute(teamInput);

    expect(result.created).toBe(false);
    expect(result.score.id).toBe('existing-1'); // reuses the row id
    expect(scoreRepo.update).toHaveBeenCalledTimes(1);
    expect(scoreRepo.create).not.toHaveBeenCalled();
  });

  it('updates (not creates) an existing UNCONFIRMED HOST score (isNull lookup hit)', async () => {
    const scoreRepo = makeScoreRepo();
    const existing = EvaluationScore.create({
      id: 'existing-host',
      roomId: 'room-1',
      targetTeamId: 'team-2',
      evaluatorType: 'HOST',
      evaluatorTeamId: null,
      hostId: 'host-1',
      topicScore: 2,
      designScore: 2,
    });
    scoreRepo.findByRoomTargetEvaluator.mockResolvedValue(existing);
    const { useCase } = setup({ scoreRepo });

    const result = await useCase.execute({
      roomId: 'room-1',
      targetTeamId: 'team-2',
      topicScore: 9,
      designScore: 1,
      evaluator: { type: 'HOST' },
    });

    expect(result.created).toBe(false);
    expect(scoreRepo.update).toHaveBeenCalledTimes(1);
    expect(scoreRepo.create).not.toHaveBeenCalled();
    // The HOST lookup is keyed with a null evaluatorTeamId (the adapter turns
    // this into isNull) — never an eq-on-null.
    expect(scoreRepo.findByRoomTargetEvaluator).toHaveBeenCalledWith(
      'room-1',
      'team-2',
      'HOST',
      null,
    );
  });

  it('rejects re-submitting a CONFIRMED score with EvaluationAlreadyConfirmedError (409)', async () => {
    const scoreRepo = makeScoreRepo();
    const confirmed = EvaluationScore.create({
      id: 'existing-1',
      roomId: 'room-1',
      targetTeamId: 'team-2',
      evaluatorType: 'TEAM',
      evaluatorTeamId: 'team-1',
      hostId: null,
      topicScore: 1,
      designScore: 1,
    }).confirm(new Date('2026-06-15T12:00:00.000Z'));
    scoreRepo.findByRoomTargetEvaluator.mockResolvedValue(confirmed);
    const { useCase } = setup({ scoreRepo });

    await expect(useCase.execute(teamInput)).rejects.toBeInstanceOf(
      EvaluationAlreadyConfirmedError,
    );
    expect(scoreRepo.update).not.toHaveBeenCalled();
  });

  it('propagates the defensive 23505 (translated EvaluationAlreadySubmittedError)', async () => {
    const scoreRepo = makeScoreRepo();
    scoreRepo.create.mockRejectedValue(new EvaluationAlreadySubmittedError());
    const { useCase } = setup({ scoreRepo });

    await expect(useCase.execute(teamInput)).rejects.toBeInstanceOf(
      EvaluationAlreadySubmittedError,
    );
  });

  it('fails loudly when the criteria catalog is not exactly two rows', async () => {
    const { useCase } = setup({
      criterionRepo: makeCriterionRepo([criteria[0]]),
    });
    await expect(useCase.execute(teamInput)).rejects.toThrow(
      /Expected exactly 2 evaluation criteria/,
    );
  });
});

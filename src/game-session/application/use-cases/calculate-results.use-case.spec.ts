import { EvaluationQueryService } from '../../../evaluation/application/queries';
import {
  EvaluationScore,
  FinalResult,
} from '../../../evaluation/domain/entities';
import {
  EvaluationNotCompleteError,
  ResultsAlreadyCalculatedError,
} from '../../../evaluation/domain/errors';
import {
  EvaluationCriterionRepositoryPort,
  EvaluationScoreRepositoryPort,
  FinalResultRepositoryPort,
} from '../../../evaluation/domain/ports';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { TransactionPort } from '../ports';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { Score, TeamName } from '../../domain/value-objects';
import { EvaluationEvent } from '../events';
import {
  aggregateRawScore,
  CalculateResultsUseCase,
} from './calculate-results.use-case';
import {
  FIXED_NOW,
  makeClock,
  makeIdGenerator,
  makePresentationSubmission,
  makePresentationSubmissionRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

/* -------------------------------------------------------------------------- */
/* Score builders.                                                            */
/* -------------------------------------------------------------------------- */

interface ScoreOpts {
  id?: string;
  target: string;
  type?: 'TEAM' | 'HOST';
  evaluatorTeamId?: string;
  topic: number;
  design: number;
  confirmed?: boolean;
}

const makeScore = (opts: ScoreOpts): EvaluationScore => {
  const type = opts.type ?? 'TEAM';
  const score = EvaluationScore.create({
    id: opts.id ?? `s-${opts.target}-${type}`,
    roomId: 'room-1',
    targetTeamId: opts.target,
    evaluatorType: type,
    evaluatorTeamId:
      type === 'TEAM' ? (opts.evaluatorTeamId ?? 'team-x') : null,
    hostId: type === 'HOST' ? 'host-1' : null,
    topicScore: opts.topic,
    designScore: opts.design,
  });
  return opts.confirmed === false ? score : score.confirm(FIXED_NOW);
};

describe('aggregateRawScore', () => {
  it('worked example A: (1·7 + 1·9 + 2·8) / 4 = 8.0 (two team votes + a host)', () => {
    const scores = [
      makeScore({ target: 'tA', evaluatorTeamId: 'tB', topic: 4, design: 3 }), // 7
      makeScore({
        id: 's-2',
        target: 'tA',
        evaluatorTeamId: 'tC',
        topic: 5,
        design: 4,
      }), // 9
      makeScore({ target: 'tA', type: 'HOST', topic: 4, design: 4 }), // 8, weight 2
    ];
    expect(aggregateRawScore(scores, 'tA')).toBeCloseTo(8.0, 9);
  });

  it('tolerate-partial B: (1·6 + 2·9) / 3 = 8.0 (an unconfirmed vote drops out)', () => {
    const scores = [
      makeScore({ target: 'tA', evaluatorTeamId: 'tB', topic: 3, design: 3 }), // 6 ✓
      makeScore({ target: 'tA', type: 'HOST', topic: 4, design: 5 }), // 9 ✓ weight 2
      makeScore({
        id: 's-unconf',
        target: 'tA',
        evaluatorTeamId: 'tC',
        topic: 1,
        design: 1,
        confirmed: false, // dropped
      }),
    ];
    expect(aggregateRawScore(scores, 'tA')).toBeCloseTo(8.0, 9);
  });

  it('a single confirmed host vote weighs ×2: 2·8 / 2 = 8', () => {
    const scores = [
      makeScore({ target: 'tA', type: 'HOST', topic: 4, design: 4 }),
    ];
    expect(aggregateRawScore(scores, 'tA')).toBe(8);
  });

  it('an unconfirmed host vote yields raw 0 (it never counts)', () => {
    const scores = [
      makeScore({
        target: 'tA',
        type: 'HOST',
        topic: 4,
        design: 4,
        confirmed: false,
      }),
    ];
    expect(aggregateRawScore(scores, 'tA')).toBe(0);
  });

  it('no confirmed score → raw 0 (no division by zero)', () => {
    expect(aggregateRawScore([], 'tA')).toBe(0);
  });

  it('is order-independent (two permutations give the same raw)', () => {
    const a = makeScore({
      id: 'a',
      target: 'tA',
      evaluatorTeamId: 'tB',
      topic: 4,
      design: 3,
    });
    const b = makeScore({
      id: 'b',
      target: 'tA',
      evaluatorTeamId: 'tC',
      topic: 5,
      design: 4,
    });
    const c = makeScore({
      id: 'c',
      target: 'tA',
      type: 'HOST',
      topic: 4,
      design: 4,
    });
    expect(aggregateRawScore([a, b, c], 'tA')).toBe(
      aggregateRawScore([c, a, b], 'tA'),
    );
  });

  it('ignores scores for other targets', () => {
    const scores = [
      makeScore({ target: 'tA', type: 'HOST', topic: 5, design: 5 }), // 10
      makeScore({
        id: 'other',
        target: 'tB',
        type: 'HOST',
        topic: 1,
        design: 1,
      }),
    ];
    expect(aggregateRawScore(scores, 'tA')).toBe(10);
  });
});

/* -------------------------------------------------------------------------- */
/* CalculateResultsUseCase.                                                   */
/* -------------------------------------------------------------------------- */

describe('CalculateResultsUseCase', () => {
  const teamA = () =>
    makeTeam({
      id: 'team-a',
      name: TeamName.create('Reds'),
      turnOrder: 0,
      captainPlayerId: 'pa',
      earnedScore: Score.create(100),
    });
  const teamB = () =>
    makeTeam({
      id: 'team-b',
      name: TeamName.create('Blues'),
      turnOrder: 1,
      captainPlayerId: 'pb',
      earnedScore: Score.create(50),
    });

  /** A complete 2-team tally: raw A = 24/3 = 8, raw B = 18/3 = 6. */
  const completeTwoTeamScores = (): EvaluationScore[] => [
    makeScore({
      id: 'tav',
      target: 'team-a',
      evaluatorTeamId: 'team-b',
      topic: 4,
      design: 4,
    }), // 8
    makeScore({
      id: 'tah',
      target: 'team-a',
      type: 'HOST',
      topic: 4,
      design: 4,
    }), // 8 ×2
    makeScore({
      id: 'tbv',
      target: 'team-b',
      evaluatorTeamId: 'team-a',
      topic: 3,
      design: 3,
    }), // 6
    makeScore({
      id: 'tbh',
      target: 'team-b',
      type: 'HOST',
      topic: 3,
      design: 3,
    }), // 6 ×2
  ];

  const makeScoreRepo = (
    scores: EvaluationScore[],
  ): jest.Mocked<EvaluationScoreRepositoryPort> => ({
    create: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    findByRoomTargetEvaluator: jest.fn().mockResolvedValue(null),
    findByRoomId: jest.fn().mockResolvedValue(scores),
  });
  const makeCriterionRepo =
    (): jest.Mocked<EvaluationCriterionRepositoryPort> => ({
      listAll: jest.fn().mockResolvedValue([]),
    });
  const makeFinalResultRepo = (): jest.Mocked<FinalResultRepositoryPort> => ({
    create: jest.fn().mockResolvedValue(undefined),
    findByRoomId: jest.fn().mockResolvedValue([]),
  });

  const build = (
    opts: {
      teams?: ReturnType<typeof makeTeam>[];
      scores?: EvaluationScore[];
      submissions?: ReturnType<typeof makePresentationSubmission>[];
      tx?: TransactionPort;
      room?: ReturnType<typeof makeRoom>;
    } = {},
  ) => {
    const teams = opts.teams ?? [teamA(), teamB()];
    const scores = opts.scores ?? completeTwoTeamScores();
    const room = opts.room ?? makeRoom({ currentStage: 'EVALUATION' });

    const rooms = makeRoomRepo();
    rooms.findById.mockResolvedValue(room);
    const teamRepo = makeTeamRepo();
    teamRepo.findByRoomId.mockResolvedValue(teams);
    const scoreRepo = makeScoreRepo(scores);
    const submissionRepo = makePresentationSubmissionRepo();
    submissionRepo.findByRoomId.mockResolvedValue(opts.submissions ?? []);
    const finalResultRepo = makeFinalResultRepo();
    const realtime = makeRealtime();
    const evaluationQuery = new EvaluationQueryService(
      scoreRepo,
      makeCriterionRepo(),
    );
    const uc = new CalculateResultsUseCase(
      opts.tx ?? makeTransactionPort(),
      rooms,
      teamRepo,
      scoreRepo,
      submissionRepo,
      finalResultRepo,
      makeIdGenerator('fr'),
      makeClock(),
      realtime,
      evaluationQuery,
    );
    return {
      uc,
      rooms,
      teamRepo,
      scoreRepo,
      submissionRepo,
      finalResultRepo,
      realtime,
      evaluationQuery,
      room,
    };
  };

  const created = (
    repo: jest.Mocked<FinalResultRepositoryPort>,
  ): FinalResult[] => repo.create.mock.calls.map((call) => call[0]);
  const byTeam = (repo: jest.Mocked<FinalResultRepositoryPort>) =>
    new Map(created(repo).map((r) => [r.teamId, r]));

  it('happy path: a row per participant, correct scores/places, finishes the game', async () => {
    const { uc, finalResultRepo, rooms, room } = build();

    const result = await uc.execute({ roomId: 'room-1' });

    // One final_results row per participant.
    expect(finalResultRepo.create).toHaveBeenCalledTimes(2);
    const map = byTeam(finalResultRepo);
    expect(map.get('team-a')).toMatchObject({
      presentationScoreRaw: 8,
      presentationScoreFinal: 8,
      finalScore: 800,
      place: 1,
    });
    expect(map.get('team-b')).toMatchObject({
      presentationScoreRaw: 6,
      presentationScoreFinal: 6,
      finalScore: 300,
      place: 2,
    });

    // The game finished: RESULTS + FINISHED, persisted once.
    expect(room.currentStage).toBe('RESULTS');
    expect(room.status).toBe('FINISHED');
    expect(room.finishedAt).toEqual(FIXED_NOW);
    expect(rooms.update).toHaveBeenCalledTimes(1);

    // The returned leaderboard is (place, teamId)-ordered with names + aggregates.
    expect(result.stage).toBe('RESULTS');
    expect(result.status).toBe('FINISHED');
    expect(result.leaderboard.leaderboard.map((e) => e.teamId)).toEqual([
      'team-a',
      'team-b',
    ]);
    expect(result.leaderboard.leaderboard[0]).toMatchObject({
      teamName: 'Reds',
      finalScore: 800,
      place: 1,
    });
  });

  it('emits completed then results-calculated AFTER the transaction, with public aggregates', async () => {
    const { uc, realtime } = build();

    await uc.execute({ roomId: 'room-1' });

    const names = realtime.emitToRoom.mock.calls.map((c) => c[1]);
    expect(names).toEqual([
      EvaluationEvent.Completed,
      EvaluationEvent.ResultsCalculated,
    ]);
    expect(realtime.emitToRoom.mock.calls[0][2]).toEqual({
      roomId: 'room-1',
      stage: 'RESULTS',
      status: 'FINISHED',
    });
    const resultsPayload = realtime.emitToRoom.mock.calls[1][2] as {
      roomId: string;
      leaderboard: Array<{ teamId: string; finalScore: number; place: number }>;
    };
    expect(resultsPayload.roomId).toBe('room-1');
    expect(resultsPayload.leaderboard).toHaveLength(2);
    expect(resultsPayload.leaderboard[0]).toMatchObject({
      teamId: 'team-a',
      finalScore: 800,
      place: 1,
    });
  });

  it('⚠️A excludes a phantom team (turnOrder null) from final_results', async () => {
    const phantom = makeTeam({
      id: 'team-ghost',
      turnOrder: null, // never presented
      captainPlayerId: null,
      earnedScore: Score.create(999),
    });
    const { uc, finalResultRepo } = build({
      teams: [teamA(), teamB(), phantom],
    });

    await uc.execute({ roomId: 'room-1' });

    expect(finalResultRepo.create).toHaveBeenCalledTimes(2);
    expect(byTeam(finalResultRepo).has('team-ghost')).toBe(false);
  });

  it('⚠️V2 teamCount tracks participants (non-null turnOrder), the voting projection', async () => {
    // Stage 12 liveness fix: the completeness gate's N counts PARTICIPANTS (the
    // teams that vote / get voted on — the listTeamsToEvaluate projection), not
    // captains. In the real flow a participant always has a captain (turnOrder
    // is assigned only to ready teams at StartGame), so this synthetic
    // captainless participant — unreachable in practice — is still counted as a
    // participant. Previously teamCount filtered on captainPlayerId and this
    // assertion read 2; it now reads 3 (all three participants).
    const captainless = makeTeam({
      id: 'team-c',
      turnOrder: 2, // presented → a participant
      captainPlayerId: null,
      earnedScore: Score.create(10),
    });
    const { uc, finalResultRepo, evaluationQuery } = build({
      teams: [teamA(), teamB(), captainless],
    });
    const progressSpy = jest.spyOn(evaluationQuery, 'getProgress');

    await uc.execute({ roomId: 'room-1', force: true });

    // The participant IS ranked…
    expect(byTeam(finalResultRepo).has('team-c')).toBe(true);
    // …and teamCount counts all three participants (turnOrder !== null).
    expect(progressSpy).toHaveBeenCalledWith('room-1', 3);
  });

  it('⚠️V2 a captained NON-participant (turnOrder null) does NOT block the gate — finishes without force', async () => {
    // The audited liveness bug it fixes: a team WITH a captain that never
    // presented (turnOrder null — not ready at StartGame, or created in
    // EVALUATION). It never appears in listTeamsToEvaluate, so the voting flow
    // can never cast its N² votes; counting it in teamCount made the gate
    // unreachable (old N=3 → teamExpected 6 vs 2 confirmed), forcing the host to
    // finish with force:true. teamCount now excludes it (turnOrder null), so a
    // COMPLETE participant tally satisfies the gate on its own — no force.
    const phantomCaptain = makeTeam({
      id: 'team-ghost',
      turnOrder: null, // never presented…
      captainPlayerId: 'pc', // …but HAS a captain
      earnedScore: Score.create(999),
    });
    const { uc, finalResultRepo, evaluationQuery, room } = build({
      teams: [teamA(), teamB(), phantomCaptain],
      scores: completeTwoTeamScores(), // complete tally for the TWO participants
    });
    const progressSpy = jest.spyOn(evaluationQuery, 'getProgress');

    // No force — the gate must pass on the complete participant tally alone.
    await expect(uc.execute({ roomId: 'room-1' })).resolves.toBeDefined();

    // teamCount excludes the captained non-participant: N = 2 participants.
    expect(progressSpy).toHaveBeenCalledWith('room-1', 2);
    // The phantom is NOT written to final_results (only the two participants)…
    expect(finalResultRepo.create).toHaveBeenCalledTimes(2);
    expect(byTeam(finalResultRepo).has('team-ghost')).toBe(false);
    // …and the real teams' scores are unchanged (same as the happy path).
    const map = byTeam(finalResultRepo);
    expect(map.get('team-a')).toMatchObject({ finalScore: 800, place: 1 });
    expect(map.get('team-b')).toMatchObject({ finalScore: 300, place: 2 });
    // The game actually finished — without force.
    expect(room.currentStage).toBe('RESULTS');
    expect(room.status).toBe('FINISHED');
  });

  it('⚠️B the completeness gate blocks an incomplete tally (409, no mutation, no emit)', async () => {
    const { uc, finalResultRepo, rooms, realtime } = build({ scores: [] });

    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      EvaluationNotCompleteError,
    );
    expect(finalResultRepo.create).not.toHaveBeenCalled();
    expect(rooms.update).not.toHaveBeenCalled();
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it('⚠️B force bypasses the gate; participants with no confirmed scores get raw 0', async () => {
    const { uc, finalResultRepo, room } = build({ scores: [] });

    await uc.execute({ roomId: 'room-1', force: true });

    expect(finalResultRepo.create).toHaveBeenCalledTimes(2);
    for (const r of created(finalResultRepo)) {
      expect(r.presentationScoreRaw).toBe(0);
      expect(r.finalScore).toBe(0); // ⚠️G floor=0
    }
    expect(room.status).toBe('FINISHED');
  });

  it('⚠️F dense places: three teams tie at place 1, the fourth is place 2', async () => {
    // All earned 100; raw via a single host vote per target (×2 ÷2 = total).
    const teams = [
      makeTeam({
        id: 't1',
        turnOrder: 0,
        captainPlayerId: 'p1',
        earnedScore: Score.create(100),
      }),
      makeTeam({
        id: 't2',
        turnOrder: 1,
        captainPlayerId: 'p2',
        earnedScore: Score.create(100),
      }),
      makeTeam({
        id: 't3',
        turnOrder: 2,
        captainPlayerId: 'p3',
        earnedScore: Score.create(100),
      }),
      makeTeam({
        id: 't4',
        turnOrder: 3,
        captainPlayerId: 'p4',
        earnedScore: Score.create(100),
      }),
    ];
    const scores = [
      makeScore({ id: 'h1', target: 't1', type: 'HOST', topic: 3, design: 2 }), // raw 5
      makeScore({ id: 'h2', target: 't2', type: 'HOST', topic: 2, design: 3 }), // raw 5
      makeScore({ id: 'h3', target: 't3', type: 'HOST', topic: 1, design: 4 }), // raw 5
      makeScore({ id: 'h4', target: 't4', type: 'HOST', topic: 2, design: 2 }), // raw 4
    ];
    const { uc, finalResultRepo } = build({ teams, scores });

    await uc.execute({ roomId: 'room-1', force: true });

    const map = byTeam(finalResultRepo);
    expect(map.get('t1')!.place).toBe(1);
    expect(map.get('t2')!.place).toBe(1);
    expect(map.get('t3')!.place).toBe(1);
    expect(map.get('t4')!.place).toBe(2); // dense — NOT 4
  });

  it('all-unconfirmed (force): every team ties at place 1 (all finalScore 0)', async () => {
    const teams = [
      makeTeam({
        id: 't1',
        turnOrder: 0,
        captainPlayerId: 'p1',
        earnedScore: Score.create(100),
      }),
      makeTeam({
        id: 't2',
        turnOrder: 1,
        captainPlayerId: 'p2',
        earnedScore: Score.create(50),
      }),
    ];
    const { uc, finalResultRepo } = build({ teams, scores: [] });

    await uc.execute({ roomId: 'room-1', force: true });

    for (const r of created(finalResultRepo)) {
      expect(r.place).toBe(1);
    }
  });

  it('⚠️C epsilon places: a sub-epsilon finalScore difference still ties', async () => {
    // t1: raw 23/3 then penalty 2/3 → final ≈ 7; t2: raw 7, no penalty → final 7.
    // The float paths differ by < 1e-9, so they MUST share a place.
    const teams = [
      makeTeam({
        id: 't1',
        turnOrder: 0,
        captainPlayerId: 'p1',
        earnedScore: Score.create(10),
      }),
      makeTeam({
        id: 't2',
        turnOrder: 1,
        captainPlayerId: 'p2',
        earnedScore: Score.create(10),
      }),
    ];
    const scores = [
      makeScore({
        id: 'v1',
        target: 't1',
        evaluatorTeamId: 't2',
        topic: 4,
        design: 3,
      }), // 7 w1
      makeScore({ id: 'h1', target: 't1', type: 'HOST', topic: 4, design: 4 }), // 8 w2 → raw 23/3
      makeScore({ id: 'h2', target: 't2', type: 'HOST', topic: 3, design: 4 }), // 7 w2 → raw 7
    ];
    const submissions = [
      makePresentationSubmission({
        id: 'sub-1',
        teamId: 't1',
        isLate: true,
        latePenalty: 2 / 3,
      }),
    ];
    // Precondition: the two finalScores really are within epsilon (the float trap).
    const fa = FinalResult.deriveScores(23 / 3, 2 / 3, 10).finalScore;
    const fb = FinalResult.deriveScores(7, 0, 10).finalScore;
    expect(Math.abs(fa - fb)).toBeLessThan(1e-9);

    const { uc, finalResultRepo } = build({ teams, scores, submissions });
    await uc.execute({ roomId: 'room-1', force: true });

    const map = byTeam(finalResultRepo);
    expect(map.get('t1')!.place).toBe(1);
    expect(map.get('t2')!.place).toBe(1);
  });

  it('⚠️H snapshots earnedScore.value (VO) and the latePenalty from the submission', async () => {
    const submissions = [
      makePresentationSubmission({
        id: 'sub-a',
        teamId: 'team-a',
        isLate: true,
        latePenalty: 2,
      }),
    ];
    const { uc, finalResultRepo } = build({ submissions });

    await uc.execute({ roomId: 'room-1' });

    const a = byTeam(finalResultRepo).get('team-a')!;
    expect(a.earnedScore).toBe(100); // Score VO unwrapped to a number
    expect(a.latePenalty).toBe(2);
    expect(a.presentationScoreFinal).toBe(6); // max(0, 8 − 2)
    expect(a.finalScore).toBe(600); // 100 × 6
    // team-b has no submission → latePenalty defaults to 0 (not NaN).
    expect(byTeam(finalResultRepo).get('team-b')!.latePenalty).toBe(0);
  });

  it('anti-drift: each stored finalScore equals deriveScores of its own inputs', async () => {
    const { uc, finalResultRepo } = build();
    await uc.execute({ roomId: 'room-1' });
    for (const r of created(finalResultRepo)) {
      const { finalScore } = FinalResult.deriveScores(
        r.presentationScoreRaw,
        r.latePenalty,
        r.earnedScore,
      );
      expect(r.finalScore).toBe(finalScore);
    }
  });

  it('rejects an unknown room (404)', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(null);
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });

  it('rejects a non-ACTIVE room (409)', async () => {
    const { uc } = build({
      room: makeRoom({
        currentStage: 'EVALUATION',
        status: 'CLOSED',
        finishedAt: FIXED_NOW,
      }),
    });
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
  });

  it('⚠️K rejects calculating outside EVALUATION (409 — the stage gate)', async () => {
    const { uc } = build({ room: makeRoom({ currentStage: 'GAME_BOARD' }) });
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
  });

  it('⚠️K is idempotent: a repeat after the finish is rejected (409, no second finish)', async () => {
    const { uc, finalResultRepo } = build();
    await uc.execute({ roomId: 'room-1' });
    finalResultRepo.create.mockClear();
    // The same room is now RESULTS + FINISHED → the second call is rejected.
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
    expect(finalResultRepo.create).not.toHaveBeenCalled();
  });

  it('acquires the room lock BEFORE reading the room', async () => {
    const { uc, rooms } = build();
    await uc.execute({ roomId: 'room-1' });
    expect(rooms.acquireRoomLock.mock.invocationCallOrder[0]).toBeLessThan(
      rooms.findById.mock.invocationCallOrder[0],
    );
  });

  it('⚠️J transitions to RESULTS BEFORE markFinished (rollback safety)', async () => {
    const room = makeRoom({ currentStage: 'EVALUATION' });
    const transitionSpy = jest.spyOn(room, 'transitionTo');
    const finishSpy = jest.spyOn(room, 'markFinished');
    const { uc } = build({ room });

    await uc.execute({ roomId: 'room-1' });

    expect(transitionSpy).toHaveBeenCalledWith('RESULTS');
    expect(finishSpy).toHaveBeenCalledWith(FIXED_NOW);
    expect(transitionSpy.mock.invocationCallOrder[0]).toBeLessThan(
      finishSpy.mock.invocationCallOrder[0],
    );
  });

  it('⚠️D does NOT emit when the commit fails (emit is strictly after commit)', async () => {
    const failingTx: TransactionPort = {
      run: async (work) => {
        await work();
        throw new Error('commit boom');
      },
    };
    const { uc, realtime } = build({ tx: failingTx });

    await expect(uc.execute({ roomId: 'room-1' })).rejects.toThrow(
      'commit boom',
    );
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it('a write-once 23505 surfaces as ResultsAlreadyCalculatedError without emitting', async () => {
    const { uc, finalResultRepo, realtime } = build();
    finalResultRepo.create.mockRejectedValueOnce(
      new ResultsAlreadyCalculatedError(),
    );
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      ResultsAlreadyCalculatedError,
    );
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it('0 participants: still finishes the game with an empty leaderboard', async () => {
    const { uc, finalResultRepo, room, realtime } = build({
      teams: [],
      scores: [],
    });

    const result = await uc.execute({ roomId: 'room-1' });

    expect(finalResultRepo.create).not.toHaveBeenCalled();
    expect(room.status).toBe('FINISHED');
    expect(result.leaderboard.leaderboard).toEqual([]);
    expect(realtime.emitToRoom.mock.calls.map((c) => c[1])).toEqual([
      EvaluationEvent.Completed,
      EvaluationEvent.ResultsCalculated,
    ]);
  });
});

import { FinalResult } from '../../domain/entities';
import { FinalResultRepositoryPort } from '../../domain/ports';
import { ResultsQueryService } from './results-query.service';

describe('ResultsQueryService', () => {
  const NOW = new Date('2026-06-16T12:00:00.000Z');

  const finalResult = (
    overrides: Partial<{
      id: string;
      teamId: string;
      earnedScore: number;
      presentationScoreRaw: number;
      latePenalty: number;
      place: number;
    }> = {},
  ): FinalResult =>
    FinalResult.create(
      {
        id: overrides.id ?? 'fr-1',
        roomId: 'room-1',
        teamId: overrides.teamId ?? 'team-1',
        earnedScore: overrides.earnedScore ?? 100,
        presentationScoreRaw: overrides.presentationScoreRaw ?? 8,
        latePenalty: overrides.latePenalty ?? 0,
        place: overrides.place ?? 1,
      },
      NOW,
    );

  const makeRepo = (
    rows: FinalResult[],
  ): jest.Mocked<FinalResultRepositoryPort> => ({
    create: jest.fn().mockResolvedValue(undefined),
    findByRoomId: jest.fn().mockResolvedValue(rows),
  });

  it('projects the leaderboard, preserving the adapter (place, teamId) order', async () => {
    // The adapter already returns sorted rows — the service keeps that order.
    const repo = makeRepo([
      finalResult({ id: 'fr-a', teamId: 'team-a', place: 1 }),
      finalResult({ id: 'fr-b', teamId: 'team-b', place: 2 }),
    ]);
    const service = new ResultsQueryService(repo);

    const view = await service.getResults(
      'room-1',
      new Map([
        ['team-a', 'Reds'],
        ['team-b', 'Blues'],
      ]),
    );

    expect(view.leaderboard.map((e) => e.teamId)).toEqual(['team-a', 'team-b']);
    expect(view.leaderboard[0].teamName).toBe('Reds');
    expect(view.leaderboard[1].teamName).toBe('Blues');
  });

  it('falls back to an empty name when the team id is missing from the map', async () => {
    const repo = makeRepo([finalResult({ teamId: 'team-x' })]);
    const service = new ResultsQueryService(repo);

    const view = await service.getResults('room-1', new Map());

    expect(view.leaderboard[0].teamName).toBe('');
  });

  it('returns an empty leaderboard before results are calculated', async () => {
    const service = new ResultsQueryService(makeRepo([]));
    const view = await service.getResults('room-1', new Map());
    expect(view.leaderboard).toEqual([]);
  });

  it('round-trips int vs double fields (earnedScore int, scores double)', async () => {
    const repo = makeRepo([
      finalResult({
        teamId: 'team-1',
        earnedScore: 100,
        presentationScoreRaw: 7.6666666,
        latePenalty: 1,
        place: 2,
      }),
    ]);
    const service = new ResultsQueryService(repo);

    const [entry] = (
      await service.getResults('room-1', new Map([['team-1', 'Reds']]))
    ).leaderboard;

    expect(entry.earnedScore).toBe(100);
    expect(entry.place).toBe(2);
    expect(entry.presentationScoreRaw).toBe(7.6666666);
    expect(entry.latePenalty).toBe(1);
    // presentationScoreFinal = max(0, 7.6666666 − 1); finalScore = 100 × that.
    expect(entry.presentationScoreFinal).toBeCloseTo(6.6666666, 6);
    expect(entry.finalScore).toBeCloseTo(666.66666, 4);
  });
});

import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { GameStage } from '../../domain/types';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { DefenseEvent } from '../events';
import { SkipPresenterUseCase } from './skip-presenter.use-case';
import {
  FIXED_NOW,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('SkipPresenterUseCase', () => {
  /** Identical setup to FinishPresentation — Skip differs ONLY by the leave event. */
  const build = (
    currentTeamId = 'team-1',
    currentStage: GameStage = 'PRESENTATION_DEFENSE',
  ) => {
    const rooms = makeRoomRepo();
    const teamRepo = makeTeamRepo();
    const realtime = makeRealtime();
    rooms.findById.mockResolvedValue(makeRoom({ currentStage, currentTeamId }));
    teamRepo.findByRoomId.mockResolvedValue([
      makeTeam({ id: 'team-1', turnOrder: 0 }),
      makeTeam({ id: 'team-2', turnOrder: 1 }),
    ]);
    const uc = new SkipPresenterUseCase(
      rooms,
      teamRepo,
      realtime,
      makeTransactionPort(),
    );
    return { uc, rooms, teamRepo, realtime };
  };

  it('advances to the next presenter (team-skipped → team-started), stays in DEFENSE', async () => {
    const { uc, rooms, realtime } = build('team-1');

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result).toEqual({
      stage: 'PRESENTATION_DEFENSE',
      currentPresenterTeamId: 'team-2',
      finished: false,
    });
    expect(rooms.update.mock.calls[0][0].currentTeamId).toBe('team-2');
    // The ONLY difference from Finish: team-SKIPPED (never team-finished).
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      1,
      'room-1',
      DefenseEvent.TeamSkipped,
      { roomId: 'room-1', teamId: 'team-1' },
    );
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      2,
      'room-1',
      DefenseEvent.TeamStarted,
      { roomId: 'room-1', teamId: 'team-2' },
    );
    const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
    expect(emitted).not.toContain(DefenseEvent.TeamFinished);
  });

  it('skipping the LAST presenter moves on to EVALUATION (team-skipped → finished)', async () => {
    const { uc, rooms, realtime } = build('team-2');

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result).toEqual({
      stage: 'EVALUATION',
      currentPresenterTeamId: null,
      finished: true,
    });
    expect(rooms.update.mock.calls[0][0].currentStage).toBe('EVALUATION');
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      1,
      'room-1',
      DefenseEvent.TeamSkipped,
      { roomId: 'room-1', teamId: 'team-2' },
    );
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      2,
      'room-1',
      DefenseEvent.Finished,
      { roomId: 'room-1', nextStage: 'EVALUATION' },
    );
  });

  it.each<GameStage>(['PRESENTATION_PREPARATION', 'GAME_BOARD', 'EVALUATION'])(
    'rejects skipping outside PRESENTATION_DEFENSE (%s) — no update, no events',
    async (stage) => {
      const { uc, rooms, realtime } = build('team-1', stage);

      await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
        UnexpectedGameStageError,
      );
      expect(rooms.update).not.toHaveBeenCalled();
      expect(realtime.emitToRoom).not.toHaveBeenCalled();
    },
  );

  it('rejects an unknown room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(null);
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });

  it('rejects a room that is not ACTIVE', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(
      makeRoom({
        currentStage: 'PRESENTATION_DEFENSE',
        currentTeamId: 'team-1',
        status: 'CLOSED',
        finishedAt: FIXED_NOW,
      }),
    );
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
  });
});

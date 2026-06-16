import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { GameStage } from '../../domain/types';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { DefenseEvent } from '../events';
import { StartDefenseUseCase } from './start-defense.use-case';
import {
  FIXED_NOW,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('StartDefenseUseCase', () => {
  /**
   * A room parked in PRESENTATION_PREPARATION (the 9.2/9.3 preparation/upload
   * lands it here) with the given participating teams (each carrying a
   * `turnOrder`). The defense state is DERIVED — no timer, no defense table.
   */
  const build = (
    teams = [
      makeTeam({ id: 'team-1', turnOrder: 0 }),
      makeTeam({ id: 'team-2', turnOrder: 1 }),
    ],
    currentStage: GameStage = 'PRESENTATION_PREPARATION',
  ) => {
    const rooms = makeRoomRepo();
    const teamRepo = makeTeamRepo();
    const realtime = makeRealtime();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage, currentTeamId: 'team-2' }),
    );
    teamRepo.findByRoomId.mockResolvedValue(teams);
    const uc = new StartDefenseUseCase(
      rooms,
      teamRepo,
      realtime,
      makeTransactionPort(),
    );
    return { uc, rooms, teamRepo, realtime };
  };

  it('opens the defenses: PRESENTATION_PREPARATION → PRESENTATION_DEFENSE, first presenter on', async () => {
    const { uc, rooms } = build();

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result).toEqual({
      stage: 'PRESENTATION_DEFENSE',
      currentPresenterTeamId: 'team-1',
      order: ['team-1', 'team-2'],
    });
    // The stage MOVED and the room was persisted (unlike the 9.2 prep start).
    const updatedRoom = rooms.update.mock.calls[0][0];
    expect(updatedRoom.currentStage).toBe('PRESENTATION_DEFENSE');
    expect(updatedRoom.currentTeamId).toBe('team-1');
  });

  it('emits started (with the order) THEN team-started (the first presenter)', async () => {
    const { uc, realtime } = build();

    await uc.execute({ roomId: 'room-1' });

    expect(realtime.emitToRoom).toHaveBeenCalledTimes(2);
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      1,
      'room-1',
      DefenseEvent.Started,
      { roomId: 'room-1', order: ['team-1', 'team-2'] },
    );
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      2,
      'room-1',
      DefenseEvent.TeamStarted,
      { roomId: 'room-1', teamId: 'team-1' },
    );
  });

  it('orders presenters by turnOrder ascending (first = turnOrder 0)', async () => {
    const { uc, rooms, realtime } = build([
      makeTeam({ id: 'team-a', turnOrder: 2 }),
      makeTeam({ id: 'team-b', turnOrder: 0 }),
      makeTeam({ id: 'team-c', turnOrder: 1 }),
    ]);

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result.order).toEqual(['team-b', 'team-c', 'team-a']);
    expect(result.currentPresenterTeamId).toBe('team-b');
    expect(rooms.update.mock.calls[0][0].currentTeamId).toBe('team-b');
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      1,
      'room-1',
      DefenseEvent.Started,
      { roomId: 'room-1', order: ['team-b', 'team-c', 'team-a'] },
    );
  });

  it('ignores teams without a turnOrder (non-participants)', async () => {
    const { uc } = build([
      makeTeam({ id: 'team-1', turnOrder: 0 }),
      makeTeam({ id: 'spectator', turnOrder: null }),
      makeTeam({ id: 'team-2', turnOrder: 1 }),
    ]);

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result.order).toEqual(['team-1', 'team-2']);
  });

  it.each<GameStage>(['LOBBY', 'GAME_BOARD', 'SHOP', 'EVALUATION'])(
    'rejects starting outside PRESENTATION_PREPARATION (%s) — no update, no events',
    async (stage) => {
      const { uc, rooms, realtime } = build(undefined, stage);

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
        currentStage: 'PRESENTATION_PREPARATION',
        status: 'CLOSED',
        finishedAt: FIXED_NOW,
      }),
    );
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
  });
});

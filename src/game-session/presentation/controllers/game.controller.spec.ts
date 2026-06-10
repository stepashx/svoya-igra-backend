import { NotImplementedException } from '@nestjs/common';
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import {
  AdvanceOnTimeoutUseCase,
  StartGameUseCase,
} from '../../application/use-cases';
import {
  makeRoom,
  makeTeam,
} from '../../application/use-cases/lobby-test-doubles';
import { GameController } from './game.controller';

describe('GameController', () => {
  const build = () => {
    const startGame = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<StartGameUseCase>;
    const advanceOnTimeout = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<AdvanceOnTimeoutUseCase>;
    const lobby = {
      getRoomState: jest.fn(),
      getRoom: jest.fn(),
      getActiveTeam: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const timers = {
      read: jest.fn(),
    } as unknown as jest.Mocked<TimerQueryService>;
    const controller = new GameController(
      startGame,
      advanceOnTimeout,
      lobby,
      timers,
    );
    return { controller, startGame, advanceOnTimeout, lobby, timers };
  };

  it('starts the game and returns the snapshot', async () => {
    const { controller, startGame } = build();
    startGame.execute.mockResolvedValue({
      room: makeRoom({ currentStage: 'GAME_BOARD' }),
      players: [],
      teams: [],
    });
    const res = await controller.start({ roomId: 'room-1', hostId: 'host-1' });
    expect(startGame.execute).toHaveBeenCalledWith({ roomId: 'room-1' });
    expect(res.room.currentStage).toBe('GAME_BOARD');
  });

  it('gets the game state', async () => {
    const { controller, lobby } = build();
    lobby.getRoomState.mockResolvedValue({
      room: makeRoom(),
      players: [],
      teams: [],
    });
    expect((await controller.getState('ABCDEF')).room.id).toBe('room-1');
  });

  it('gets the current stage', async () => {
    const { controller, lobby } = build();
    lobby.getRoom.mockResolvedValue(makeRoom({ currentStage: 'TEAM_SETUP' }));
    expect(await controller.getStage('ABCDEF')).toEqual({
      currentStage: 'TEAM_SETUP',
    });
  });

  it('gets the active team (or null)', async () => {
    const { controller, lobby } = build();
    lobby.getActiveTeam.mockResolvedValue(makeTeam({ id: 'team-1' }));
    expect((await controller.getActiveTeam('ABCDEF'))?.id).toBe('team-1');

    lobby.getActiveTeam.mockResolvedValue(null);
    expect(await controller.getActiveTeam('ABCDEF')).toBeNull();
  });

  it('reads the answer timer state', async () => {
    const { controller, timers } = build();
    const endsAt = new Date('2026-06-10T12:01:00.000Z');
    timers.read.mockResolvedValue({
      status: 'RUNNING',
      startedAt: new Date('2026-06-10T12:00:00.000Z'),
      endsAt,
      remainingMs: 60_000,
    });
    const res = await controller.getTimer('ABCDEF');
    expect(timers.read).toHaveBeenCalledWith('ABCDEF');
    expect(res).toEqual({
      status: 'RUNNING',
      startedAt: '2026-06-10T12:00:00.000Z',
      endsAt: '2026-06-10T12:01:00.000Z',
      remainingMs: 60_000,
    });
  });

  it('advances past an expired timer and returns the new stage', async () => {
    const { controller, advanceOnTimeout } = build();
    advanceOnTimeout.execute.mockResolvedValue({ stage: 'ANSWER_REVIEW' });
    const res = await controller.advance({
      roomId: 'room-1',
      hostId: 'host-1',
    });
    expect(advanceOnTimeout.execute).toHaveBeenCalledWith({ roomId: 'room-1' });
    expect(res).toEqual({ currentStage: 'ANSWER_REVIEW' });
  });

  it('still returns 501 for the deferred game finish', () => {
    const { controller } = build();
    expect(() => controller.finish()).toThrow(NotImplementedException);
  });
});

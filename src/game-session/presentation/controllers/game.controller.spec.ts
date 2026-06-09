import { NotImplementedException } from '@nestjs/common';
import { LobbyQueryService } from '../../application/queries';
import { StartGameUseCase } from '../../application/use-cases';
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
    const lobby = {
      getRoomState: jest.fn(),
      getRoom: jest.fn(),
      getActiveTeam: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const controller = new GameController(startGame, lobby);
    return { controller, startGame, lobby };
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

  it('still returns 501 for the deferred gameplay controls', () => {
    const { controller } = build();
    expect(() => controller.getTimer()).toThrow(NotImplementedException);
    expect(() => controller.advance()).toThrow(NotImplementedException);
    expect(() => controller.finish()).toThrow(NotImplementedException);
  });
});

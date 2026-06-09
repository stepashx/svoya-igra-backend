import { NotImplementedException } from '@nestjs/common';
import { GameController } from './game.controller';

describe('GameController', () => {
  const controller = new GameController();

  it('returns 501 from every handler', () => {
    expect(() => controller.start()).toThrow(NotImplementedException);
    expect(() => controller.getState()).toThrow(NotImplementedException);
    expect(() => controller.getStage()).toThrow(NotImplementedException);
    expect(() => controller.getActiveTeam()).toThrow(NotImplementedException);
    expect(() => controller.getTimer()).toThrow(NotImplementedException);
    expect(() => controller.advance()).toThrow(NotImplementedException);
    expect(() => controller.finish()).toThrow(NotImplementedException);
  });
});

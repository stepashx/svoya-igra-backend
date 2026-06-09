import { NotImplementedException } from '@nestjs/common';
import { PlayersController } from './players.controller';

describe('PlayersController', () => {
  const controller = new PlayersController();

  it('returns 501 from every handler', () => {
    expect(() => controller.create()).toThrow(NotImplementedException);
    expect(() => controller.list()).toThrow(NotImplementedException);
    expect(() => controller.getMe()).toThrow(NotImplementedException);
    expect(() => controller.reconnect()).toThrow(NotImplementedException);
  });
});

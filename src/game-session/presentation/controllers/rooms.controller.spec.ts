import { NotImplementedException } from '@nestjs/common';
import { RoomsController } from './rooms.controller';

describe('RoomsController', () => {
  const controller = new RoomsController();

  it('returns 501 from every handler', () => {
    expect(() => controller.create()).toThrow(NotImplementedException);
    expect(() => controller.getByCode()).toThrow(NotImplementedException);
    expect(() => controller.getState()).toThrow(NotImplementedException);
    expect(() => controller.getStatus()).toThrow(NotImplementedException);
    expect(() => controller.reconnectHost()).toThrow(NotImplementedException);
    expect(() => controller.close()).toThrow(NotImplementedException);
  });
});

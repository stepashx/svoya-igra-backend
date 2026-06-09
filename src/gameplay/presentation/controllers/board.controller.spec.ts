import { NotImplementedException } from '@nestjs/common';
import { BoardController } from './board.controller';

describe('BoardController', () => {
  const controller = new BoardController();

  it('returns 501 for every board read endpoint', () => {
    expect(() => controller.getBoard()).toThrow(NotImplementedException);
    expect(() => controller.getCategories()).toThrow(NotImplementedException);
    expect(() => controller.getCells()).toThrow(NotImplementedException);
    expect(() => controller.getActiveCell()).toThrow(NotImplementedException);
  });
});

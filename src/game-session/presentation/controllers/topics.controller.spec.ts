import { NotImplementedException } from '@nestjs/common';
import { TopicsController } from './topics.controller';

describe('TopicsController', () => {
  const controller = new TopicsController();

  it('returns 501 from every handler', () => {
    expect(() => controller.getAll()).toThrow(NotImplementedException);
    expect(() => controller.getRoomTopics()).toThrow(NotImplementedException);
  });
});

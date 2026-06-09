import { NotImplementedException } from '@nestjs/common';
import { QuestionsController } from './questions.controller';

describe('QuestionsController', () => {
  const controller = new QuestionsController();

  it('returns 501 for every question read endpoint', () => {
    expect(() => controller.getCurrent()).toThrow(NotImplementedException);
    expect(() => controller.getCurrentForHost()).toThrow(
      NotImplementedException,
    );
    expect(() => controller.getCurrentAnswer()).toThrow(
      NotImplementedException,
    );
    expect(() => controller.list()).toThrow(NotImplementedException);
  });
});

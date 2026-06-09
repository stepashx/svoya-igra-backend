import { NotImplementedException } from '@nestjs/common';
import { TeamsController } from './teams.controller';

describe('TeamsController', () => {
  const controller = new TeamsController();

  it('returns 501 from every handler', () => {
    expect(() => controller.create()).toThrow(NotImplementedException);
    expect(() => controller.list()).toThrow(NotImplementedException);
    expect(() => controller.getById()).toThrow(NotImplementedException);
    expect(() => controller.addMember()).toThrow(NotImplementedException);
    expect(() => controller.selectTopic()).toThrow(NotImplementedException);
    expect(() => controller.setReady()).toThrow(NotImplementedException);
    expect(() => controller.getCaptain()).toThrow(NotImplementedException);
  });
});

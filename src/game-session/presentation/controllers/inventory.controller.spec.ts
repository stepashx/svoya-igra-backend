import { NotImplementedException } from '@nestjs/common';
import { InventoryController } from './inventory.controller';

describe('InventoryController (8.1 stubs)', () => {
  const controller = new InventoryController();

  it('returns 501 for the team inventory (8.3)', () => {
    expect(() => controller.getTeamInventory()).toThrow(
      NotImplementedException,
    );
  });

  it('returns 501 for the team QR tools (8.3)', () => {
    expect(() => controller.getTeamQrTools()).toThrow(NotImplementedException);
  });
});

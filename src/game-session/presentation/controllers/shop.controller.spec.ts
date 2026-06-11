import { NotImplementedException } from '@nestjs/common';
import { ShopController } from './shop.controller';

describe('ShopController (8.1 stubs)', () => {
  const controller = new ShopController();

  it('returns 501 for the shop catalog (8.2)', () => {
    expect(() => controller.listItems()).toThrow(NotImplementedException);
  });

  it('returns 501 for purchase (8.3)', () => {
    expect(() => controller.purchase()).toThrow(NotImplementedException);
  });

  it('returns 501 for the shop round (8.2)', () => {
    expect(() => controller.getRound()).toThrow(NotImplementedException);
  });

  it('returns 501 for shop close (8.2)', () => {
    expect(() => controller.close()).toThrow(NotImplementedException);
  });

  it('returns 501 for the purchase list (8.3)', () => {
    expect(() => controller.listPurchases()).toThrow(NotImplementedException);
  });
});

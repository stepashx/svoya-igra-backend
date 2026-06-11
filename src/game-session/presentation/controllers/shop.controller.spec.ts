import { NotImplementedException } from '@nestjs/common';
import { ShopQueryService } from '../../../commerce/application/queries';
import { ShopItem } from '../../../commerce/domain/entities';
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import { CloseShopUseCase } from '../../application/use-cases';
import {
  FIXED_NOW,
  makeRoom,
} from '../../application/use-cases/lobby-test-doubles';
import { ShopController } from './shop.controller';

describe('ShopController', () => {
  const item = ShopItem.reconstitute({
    id: 'item-1',
    title: 'Товар 1',
    description: null,
    price: 100,
    qrToolId: 'qr-1',
    createdAt: FIXED_NOW,
  });

  const build = () => {
    const shopQuery = {
      listCatalog: jest.fn(),
    } as unknown as jest.Mocked<ShopQueryService>;
    const closeShop = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CloseShopUseCase>;
    const lobby = {
      getRoom: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const timers = {
      readShop: jest.fn(),
    } as unknown as jest.Mocked<TimerQueryService>;
    const controller = new ShopController(shopQuery, closeShop, lobby, timers);
    return { controller, shopQuery, closeShop, lobby, timers };
  };

  it('lists the catalog with availability (8.2)', async () => {
    const { controller, shopQuery, lobby } = build();
    lobby.getRoom.mockResolvedValue(makeRoom({ id: 'room-1' }));
    shopQuery.listCatalog.mockResolvedValue([{ item, available: false }]);

    const res = await controller.listItems('ABCDEF');

    expect(shopQuery.listCatalog).toHaveBeenCalledWith('room-1');
    expect(res).toEqual([
      {
        id: 'item-1',
        title: 'Товар 1',
        description: null,
        price: 100,
        qrToolId: 'qr-1',
        available: false,
      },
    ]);
  });

  it('returns the shop round with finality and timer (8.2)', async () => {
    const { controller, lobby, timers } = build();
    lobby.getRoom.mockResolvedValue(
      makeRoom({
        currentStage: 'SHOP',
        blockedQuestionsCount: 30,
        currentShopRound: 5,
      }),
    );
    timers.readShop.mockResolvedValue({
      status: 'RUNNING',
      startedAt: new Date('2026-06-10T12:00:00.000Z'),
      endsAt: new Date('2026-06-10T12:02:00.000Z'),
      minClosableAt: new Date('2026-06-10T12:00:30.000Z'),
      remainingMs: 120_000,
      closable: false,
    });

    const res = await controller.getRound('ABCDEF');

    expect(timers.readShop).toHaveBeenCalledWith('ABCDEF');
    expect(res).toEqual({
      currentShopRound: 5,
      currentStage: 'SHOP',
      isFinalShop: true,
      timer: {
        status: 'RUNNING',
        startedAt: '2026-06-10T12:00:00.000Z',
        endsAt: '2026-06-10T12:02:00.000Z',
        minClosableAt: '2026-06-10T12:00:30.000Z',
        remainingMs: 120_000,
        closable: false,
      },
    });
  });

  it('closes the shop and returns the stage it landed in (8.2)', async () => {
    const { controller, closeShop } = build();
    closeShop.execute.mockResolvedValue({ stage: 'GAME_BOARD' });

    const res = await controller.close({ roomId: 'room-1', hostId: 'host-1' });

    expect(closeShop.execute).toHaveBeenCalledWith({ roomId: 'room-1' });
    expect(res).toEqual({ currentStage: 'GAME_BOARD' });
  });

  it('returns 501 for purchase (8.3)', () => {
    const { controller } = build();
    expect(() => controller.purchase()).toThrow(NotImplementedException);
  });

  it('returns 501 for the purchase list (8.3)', () => {
    const { controller } = build();
    expect(() => controller.listPurchases()).toThrow(NotImplementedException);
  });
});

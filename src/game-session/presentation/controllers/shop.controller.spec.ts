import { ShopQueryService } from '../../../commerce/application/queries';
import { ShopItem } from '../../../commerce/domain/entities';
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import {
  CloseShopUseCase,
  PurchaseItemUseCase,
} from '../../application/use-cases';
import {
  FIXED_NOW,
  makeInventoryItem,
  makePlayer,
  makePurchase,
  makeQrTool,
  makeRoom,
  makeShopItem,
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
      listPurchases: jest.fn(),
    } as unknown as jest.Mocked<ShopQueryService>;
    const closeShop = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CloseShopUseCase>;
    const purchaseItem = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<PurchaseItemUseCase>;
    const lobby = {
      getRoom: jest.fn(),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const timers = {
      readShop: jest.fn(),
    } as unknown as jest.Mocked<TimerQueryService>;
    const controller = new ShopController(
      shopQuery,
      closeShop,
      purchaseItem,
      lobby,
      timers,
    );
    return { controller, shopQuery, closeShop, purchaseItem, lobby, timers };
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

  it('purchases an item for the captain’s team and returns the rich reply (8.3)', async () => {
    const { controller, purchaseItem } = build();
    const player = makePlayer({
      id: 'captain-1',
      roomId: 'room-1',
      teamId: 'team-1',
    });
    const qrTool = makeQrTool({ id: 'qr-1' });
    purchaseItem.execute.mockResolvedValue({
      purchase: makePurchase({
        id: 'purchase-1',
        teamId: 'team-1',
        shopItemId: 'shop-item-1',
        price: 100,
      }),
      inventoryItem: makeInventoryItem({
        id: 'inv-1',
        teamId: 'team-1',
        shopItemId: 'shop-item-1',
        qrToolId: 'qr-1',
      }),
      qrTool,
      shopItem: makeShopItem({ id: 'shop-item-1' }),
      balance: 400,
    });

    const res = await controller.purchase(player, {
      shopItemId: 'shop-item-1',
    });

    expect(purchaseItem.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      shopItemId: 'shop-item-1',
      actingPlayerId: 'captain-1',
    });
    expect(res).toEqual({
      purchase: {
        id: 'purchase-1',
        teamId: 'team-1',
        shopItemId: 'shop-item-1',
        price: 100,
        purchasedAt: FIXED_NOW.toISOString(),
      },
      inventoryItem: {
        id: 'inv-1',
        shopItemId: 'shop-item-1',
        qrToolId: 'qr-1',
        addedAt: FIXED_NOW.toISOString(),
      },
      qrTool: {
        id: 'qr-1',
        title: qrTool.title,
        description: qrTool.description,
        fileFormat: 'SVG',
        publicUrl: qrTool.publicUrl,
      },
      balance: 400,
    });
  });

  it('lists the room purchases (8.3)', async () => {
    const { controller, lobby, shopQuery } = build();
    lobby.getRoom.mockResolvedValue(makeRoom({ id: 'room-1' }));
    shopQuery.listPurchases.mockResolvedValue([
      makePurchase({
        id: 'purchase-1',
        teamId: 'team-1',
        shopItemId: 'shop-item-1',
        price: 100,
      }),
    ]);

    const res = await controller.listPurchases('ABCDEF');

    expect(shopQuery.listPurchases).toHaveBeenCalledWith('room-1');
    expect(res).toEqual([
      {
        id: 'purchase-1',
        teamId: 'team-1',
        shopItemId: 'shop-item-1',
        price: 100,
        purchasedAt: FIXED_NOW.toISOString(),
      },
    ]);
  });
});

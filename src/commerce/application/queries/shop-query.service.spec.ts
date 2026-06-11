import { Purchase, ShopItem } from '../../domain/entities';
import {
  PurchaseRepositoryPort,
  ShopItemRepositoryPort,
} from '../../domain/ports';
import { ShopQueryService } from './shop-query.service';

const NOW = new Date('2026-06-11T12:00:00.000Z');

const makeShopItem = (id: string): ShopItem =>
  ShopItem.reconstitute({
    id,
    title: `Item ${id}`,
    description: null,
    price: 100,
    qrToolId: `qr-${id}`,
    createdAt: NOW,
  });

const makePurchase = (shopItemId: string): Purchase =>
  Purchase.reconstitute({
    id: `purchase-${shopItemId}`,
    roomId: 'room-1',
    teamId: 'team-1',
    shopItemId,
    price: 100,
    purchasedAt: NOW,
  });

describe('ShopQueryService', () => {
  const build = (items: ShopItem[], purchases: Purchase[]) => {
    const shopItems: jest.Mocked<ShopItemRepositoryPort> = {
      listAll: jest.fn().mockResolvedValue(items),
      findById: jest.fn().mockResolvedValue(null),
    };
    const purchaseRepo: jest.Mocked<PurchaseRepositoryPort> = {
      create: jest.fn().mockResolvedValue(undefined),
      listByRoomId: jest.fn().mockResolvedValue(purchases),
      existsByRoomAndShopItem: jest.fn().mockResolvedValue(false),
    };
    return {
      service: new ShopQueryService(shopItems, purchaseRepo),
      purchaseRepo,
    };
  };

  it('marks every item available when the room has no purchases', async () => {
    const { service, purchaseRepo } = build(
      [makeShopItem('item-1'), makeShopItem('item-2')],
      [],
    );

    const catalog = await service.listCatalog('room-1');

    expect(purchaseRepo.listByRoomId).toHaveBeenCalledWith('room-1');
    expect(catalog).toHaveLength(2);
    expect(catalog.every((entry) => entry.available)).toBe(true);
  });

  it('marks a purchased item unavailable, leaving the rest available', async () => {
    const { service } = build(
      [makeShopItem('item-1'), makeShopItem('item-2')],
      [makePurchase('item-2')],
    );

    const catalog = await service.listCatalog('room-1');

    expect(catalog.find((entry) => entry.item.id === 'item-1')?.available).toBe(
      true,
    );
    expect(catalog.find((entry) => entry.item.id === 'item-2')?.available).toBe(
      false,
    );
  });
});

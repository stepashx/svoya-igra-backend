import { InventoryItem, QrTool, ShopItem } from '../../domain/entities';
import {
  InventoryItemRepositoryPort,
  QrToolRepositoryPort,
  ShopItemRepositoryPort,
} from '../../domain/ports';
import { InventoryQueryService } from './inventory-query.service';

const NOW = new Date('2026-06-11T12:00:00.000Z');

const makeShopItem = (id: string, qrToolId: string): ShopItem =>
  ShopItem.reconstitute({
    id,
    title: `Item ${id}`,
    description: null,
    price: 100,
    qrToolId,
    createdAt: NOW,
  });

const makeQrTool = (id: string): QrTool =>
  QrTool.reconstitute({
    id,
    title: `Tool ${id}`,
    description: null,
    fileFormat: 'SVG',
    publicUrl: `https://cdn.example/${id}.svg`,
    createdAt: NOW,
  });

const makeInventoryItem = (
  shopItemId: string,
  qrToolId: string,
): InventoryItem =>
  InventoryItem.reconstitute({
    id: `inv-${shopItemId}`,
    roomId: 'room-1',
    teamId: 'team-1',
    shopItemId,
    qrToolId,
    addedAt: NOW,
  });

describe('InventoryQueryService', () => {
  const build = (
    entries: InventoryItem[],
    shopItems: ShopItem[],
    qrTools: QrTool[],
  ) => {
    const inventory: jest.Mocked<InventoryItemRepositoryPort> = {
      create: jest.fn(),
      listByRoomAndTeam: jest.fn().mockResolvedValue(entries),
      listByRoomId: jest.fn().mockResolvedValue(entries),
    };
    const shopItemRepo: jest.Mocked<ShopItemRepositoryPort> = {
      listAll: jest.fn().mockResolvedValue(shopItems),
      findById: jest.fn(),
    };
    const qrToolRepo: jest.Mocked<QrToolRepositoryPort> = {
      findById: jest.fn(),
      listByIds: jest.fn().mockResolvedValue(qrTools),
    };
    return {
      service: new InventoryQueryService(inventory, shopItemRepo, qrToolRepo),
      inventory,
      qrToolRepo,
    };
  };

  it('hydrates each entry with its shop item and QR tool', async () => {
    const { service, inventory, qrToolRepo } = build(
      [makeInventoryItem('item-1', 'qr-1')],
      [makeShopItem('item-1', 'qr-1'), makeShopItem('item-2', 'qr-2')],
      [makeQrTool('qr-1')],
    );

    const views = await service.listTeamInventory('room-1', 'team-1');

    expect(inventory.listByRoomAndTeam).toHaveBeenCalledWith(
      'room-1',
      'team-1',
    );
    expect(qrToolRepo.listByIds).toHaveBeenCalledWith(['qr-1']);
    expect(views).toHaveLength(1);
    expect(views[0].inventoryItem.shopItemId).toBe('item-1');
    expect(views[0].shopItem.title).toBe('Item item-1');
    expect(views[0].qrTool.publicUrl).toBe('https://cdn.example/qr-1.svg');
  });

  it('returns [] for an empty inventory without hitting the catalogs', async () => {
    const { service, qrToolRepo } = build([], [], []);

    const views = await service.listTeamInventory('room-1', 'team-1');

    expect(views).toEqual([]);
    expect(qrToolRepo.listByIds).not.toHaveBeenCalled();
  });

  it('lists the QR tools behind the team inventory', async () => {
    const qrTools = [makeQrTool('qr-1'), makeQrTool('qr-2')];
    const { service, qrToolRepo } = build(
      [
        makeInventoryItem('item-1', 'qr-1'),
        makeInventoryItem('item-2', 'qr-2'),
      ],
      [],
      qrTools,
    );

    const tools = await service.listTeamQrTools('room-1', 'team-1');

    expect(qrToolRepo.listByIds).toHaveBeenCalledWith(['qr-1', 'qr-2']);
    expect(tools).toBe(qrTools);
  });

  it('lists no QR tools for an empty inventory', async () => {
    const { service, qrToolRepo } = build([], [], []);

    const tools = await service.listTeamQrTools('room-1', 'team-1');

    expect(tools).toEqual([]);
    expect(qrToolRepo.listByIds).not.toHaveBeenCalled();
  });
});

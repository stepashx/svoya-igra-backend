import { InventoryQueryService } from '../../../commerce/application/queries';
import { LobbyQueryService } from '../../application/queries';
import {
  FIXED_NOW,
  makeInventoryItem,
  makeQrTool,
  makeRoom,
  makeShopItem,
} from '../../application/use-cases/lobby-test-doubles';
import { InventoryController } from './inventory.controller';

describe('InventoryController (8.3)', () => {
  const build = () => {
    const lobby = {
      getRoom: jest.fn().mockResolvedValue(makeRoom({ id: 'room-1' })),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const inventory = {
      listTeamInventory: jest.fn(),
      listTeamQrTools: jest.fn(),
    } as unknown as jest.Mocked<InventoryQueryService>;
    const controller = new InventoryController(lobby, inventory);
    return { controller, lobby, inventory };
  };

  it('returns the team inventory hydrated with title + QR tool (no price)', async () => {
    const { controller, lobby, inventory } = build();
    const qrTool = makeQrTool({ id: 'qr-1' });
    inventory.listTeamInventory.mockResolvedValue([
      {
        inventoryItem: makeInventoryItem({
          id: 'inv-1',
          shopItemId: 'shop-item-1',
          qrToolId: 'qr-1',
        }),
        shopItem: makeShopItem({ id: 'shop-item-1', title: 'Товар 1' }),
        qrTool,
      },
    ]);

    const res = await controller.getTeamInventory('ABCDEF', 'team-1');

    expect(lobby.getRoom).toHaveBeenCalledWith('ABCDEF');
    expect(inventory.listTeamInventory).toHaveBeenCalledWith(
      'room-1',
      'team-1',
    );
    expect(res).toEqual([
      {
        id: 'inv-1',
        shopItemId: 'shop-item-1',
        shopItemTitle: 'Товар 1',
        addedAt: FIXED_NOW.toISOString(),
        qrTool: {
          id: 'qr-1',
          title: qrTool.title,
          description: qrTool.description,
          fileFormat: 'SVG',
          publicUrl: qrTool.publicUrl,
        },
      },
    ]);
    // No price leaks into the inventory view (the snapshot is in purchases).
    expect(JSON.stringify(res)).not.toContain('price');
  });

  it('returns the QR tools behind the team inventory (publicUrl included)', async () => {
    const { controller, inventory } = build();
    const qrTool = makeQrTool({ id: 'qr-1' });
    inventory.listTeamQrTools.mockResolvedValue([qrTool]);

    const res = await controller.getTeamQrTools('ABCDEF', 'team-1');

    expect(inventory.listTeamQrTools).toHaveBeenCalledWith('room-1', 'team-1');
    expect(res).toEqual([
      {
        id: 'qr-1',
        title: qrTool.title,
        description: qrTool.description,
        fileFormat: 'SVG',
        publicUrl: qrTool.publicUrl,
      },
    ]);
  });
});

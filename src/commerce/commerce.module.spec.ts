import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../infrastructure/database/database.service';
import { TransactionContext } from '../infrastructure/database/transaction-context';
import { ShopQueryService } from './application/queries';
import {
  INVENTORY_ITEM_REPOSITORY_PORT,
  PURCHASE_REPOSITORY_PORT,
  QR_TOOL_REPOSITORY_PORT,
  SHOP_ITEM_REPOSITORY_PORT,
} from './domain/ports';
import {
  DrizzleInventoryItemRepository,
  DrizzlePurchaseRepository,
  DrizzleQrToolRepository,
  DrizzleShopItemRepository,
} from './infrastructure/persistence';

/**
 * Verifies the DI wiring of CommerceModule without the real
 * InfrastructureModule (no PostgreSQL pool). The bindings mirror the module;
 * boundary dependencies (DatabaseService, TransactionContext) are stubbed,
 * as in the gameplay module spec.
 */
describe('CommerceModule wiring', () => {
  const databaseStub = {
    db: {},
    transaction: jest.fn(),
  } as unknown as DatabaseService;

  const buildModule = (): Promise<TestingModule> =>
    Test.createTestingModule({
      providers: [
        { provide: DatabaseService, useValue: databaseStub },
        TransactionContext,
        {
          provide: SHOP_ITEM_REPOSITORY_PORT,
          useClass: DrizzleShopItemRepository,
        },
        { provide: QR_TOOL_REPOSITORY_PORT, useClass: DrizzleQrToolRepository },
        {
          provide: PURCHASE_REPOSITORY_PORT,
          useClass: DrizzlePurchaseRepository,
        },
        {
          provide: INVENTORY_ITEM_REPOSITORY_PORT,
          useClass: DrizzleInventoryItemRepository,
        },
        // Read model (8.2), mirroring the module.
        ShopQueryService,
      ],
    }).compile();

  it('resolves the four repository ports to their Drizzle adapters', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(SHOP_ITEM_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleShopItemRepository,
    );
    expect(moduleRef.get(QR_TOOL_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleQrToolRepository,
    );
    expect(moduleRef.get(PURCHASE_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzlePurchaseRepository,
    );
    expect(moduleRef.get(INVENTORY_ITEM_REPOSITORY_PORT)).toBeInstanceOf(
      DrizzleInventoryItemRepository,
    );
    await moduleRef.close();
  });

  it('instantiates the shop read model (8.2)', async () => {
    const moduleRef = await buildModule();
    expect(moduleRef.get(ShopQueryService)).toBeInstanceOf(ShopQueryService);
    await moduleRef.close();
  });
});

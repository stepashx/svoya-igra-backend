import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { purchases } from '../../../infrastructure/database/schema';
import { Purchase } from '../../domain/entities';
import { PurchaseRepositoryPort } from '../../domain/ports';
import { mapPurchaseToInsert, mapRowToPurchase } from './mappers';
import { translateUniqueViolation } from './pg-error.util';

/**
 * Drizzle/PostgreSQL adapter for {@link PurchaseRepositoryPort}. `create`
 * translates the `purchases_room_id_shop_item_id_uq` 23505 (a concurrent buy
 * losing the §14.8 uniqueness race) into {@link ItemAlreadyPurchasedError}.
 */
@Injectable()
export class DrizzlePurchaseRepository implements PurchaseRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async create(purchase: Purchase): Promise<void> {
    try {
      await this.executor()
        .insert(purchases)
        .values(mapPurchaseToInsert(purchase));
    } catch (error) {
      translateUniqueViolation(error);
    }
  }

  async listByRoomId(roomId: string): Promise<Purchase[]> {
    const rows = await this.executor()
      .select()
      .from(purchases)
      .where(eq(purchases.roomId, roomId));
    return rows.map(mapRowToPurchase);
  }

  /** Cheap purchased-state probe (one column, one row) — §14.8 availability. */
  async existsByRoomAndShopItem(
    roomId: string,
    shopItemId: string,
  ): Promise<boolean> {
    const [row] = await this.executor()
      .select({ id: purchases.id })
      .from(purchases)
      .where(
        and(eq(purchases.roomId, roomId), eq(purchases.shopItemId, shopItemId)),
      )
      .limit(1);
    return row !== undefined;
  }
}

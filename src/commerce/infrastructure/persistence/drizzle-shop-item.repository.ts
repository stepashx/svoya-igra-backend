import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { shopItems } from '../../../infrastructure/database/schema';
import { ShopItem } from '../../domain/entities';
import { ShopItemRepositoryPort } from '../../domain/ports';
import { mapRowToShopItem } from './mappers';

/** Drizzle/PostgreSQL adapter for {@link ShopItemRepositoryPort} (read-only). */
@Injectable()
export class DrizzleShopItemRepository implements ShopItemRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async listAll(): Promise<ShopItem[]> {
    const rows = await this.executor().select().from(shopItems);
    return rows.map(mapRowToShopItem);
  }

  async findById(id: string): Promise<ShopItem | null> {
    const [row] = await this.executor()
      .select()
      .from(shopItems)
      .where(eq(shopItems.id, id))
      .limit(1);
    return row ? mapRowToShopItem(row) : null;
  }
}

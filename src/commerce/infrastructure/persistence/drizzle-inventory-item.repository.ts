import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { inventoryItems } from '../../../infrastructure/database/schema';
import { InventoryItem } from '../../domain/entities';
import { InventoryItemRepositoryPort } from '../../domain/ports';
import { mapInventoryItemToInsert, mapRowToInventoryItem } from './mappers';

/**
 * Drizzle/PostgreSQL adapter for {@link InventoryItemRepositoryPort}.
 * `inventory_items` carries no unique index, so writes need no 23505
 * translation.
 */
@Injectable()
export class DrizzleInventoryItemRepository implements InventoryItemRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async create(item: InventoryItem): Promise<void> {
    await this.executor()
      .insert(inventoryItems)
      .values(mapInventoryItemToInsert(item));
  }

  async listByRoomAndTeam(
    roomId: string,
    teamId: string,
  ): Promise<InventoryItem[]> {
    const rows = await this.executor()
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.roomId, roomId),
          eq(inventoryItems.teamId, teamId),
        ),
      );
    return rows.map(mapRowToInventoryItem);
  }

  /** All inventory entries of a room (host snapshot across teams). */
  async listByRoomId(roomId: string): Promise<InventoryItem[]> {
    const rows = await this.executor()
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.roomId, roomId));
    return rows.map(mapRowToInventoryItem);
  }
}

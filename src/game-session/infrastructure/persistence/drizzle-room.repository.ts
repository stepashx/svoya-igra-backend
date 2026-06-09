import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DrizzleDatabase } from '../../../infrastructure/database/database.types';
import { rooms } from '../../../infrastructure/database/schema';
import { Room } from '../../domain/entities';
import { RoomRepositoryPort } from '../../domain/ports';
import { ReconnectToken, RoomCode } from '../../domain/value-objects';
import { mapRoomToInsert, mapRoomToUpdate, mapRowToRoom } from './mappers';

/** Drizzle/PostgreSQL adapter for {@link RoomRepositoryPort}. */
@Injectable()
export class DrizzleRoomRepository implements RoomRepositoryPort {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Query executor. Resolves to the plain Drizzle client in 5.1; becomes
   * transaction-aware (ambient `tx` via AsyncLocalStorage) in 5.2.
   */
  private get executor(): DrizzleDatabase {
    return this.database.db;
  }

  async create(room: Room): Promise<void> {
    await this.executor.insert(rooms).values(mapRoomToInsert(room));
  }

  async update(room: Room): Promise<void> {
    await this.executor
      .update(rooms)
      .set(mapRoomToUpdate(room))
      .where(eq(rooms.id, room.id));
  }

  async findById(id: string): Promise<Room | null> {
    const [row] = await this.executor
      .select()
      .from(rooms)
      .where(eq(rooms.id, id))
      .limit(1);
    return row ? mapRowToRoom(row) : null;
  }

  async findByCode(code: RoomCode): Promise<Room | null> {
    const [row] = await this.executor
      .select()
      .from(rooms)
      .where(eq(rooms.code, code.value))
      .limit(1);
    return row ? mapRowToRoom(row) : null;
  }

  async findByHostReconnectToken(token: ReconnectToken): Promise<Room | null> {
    const [row] = await this.executor
      .select()
      .from(rooms)
      .where(eq(rooms.hostReconnectToken, token.value))
      .limit(1);
    return row ? mapRowToRoom(row) : null;
  }
}

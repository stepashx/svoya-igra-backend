import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DbExecutor } from '../../../infrastructure/database/database.types';
import { TransactionContext } from '../../../infrastructure/database/transaction-context';
import { rooms } from '../../../infrastructure/database/schema';
import { Room } from '../../domain/entities';
import { RoomRepositoryPort } from '../../domain/ports';
import { ReconnectToken, RoomCode } from '../../domain/value-objects';
import { mapRoomToInsert, mapRoomToUpdate, mapRowToRoom } from './mappers';
import { translateUniqueViolation } from './pg-error.util';

/** Drizzle/PostgreSQL adapter for {@link RoomRepositoryPort}. */
@Injectable()
export class DrizzleRoomRepository implements RoomRepositoryPort {
  constructor(
    private readonly database: DatabaseService,
    private readonly txContext: TransactionContext,
  ) {}

  /**
   * Query executor. Resolves to the ambient transaction when one is active (so
   * writes join the surrounding use-case transaction), otherwise the pooled
   * Drizzle client.
   */
  private executor(): DbExecutor {
    return this.txContext.current ?? this.database.db;
  }

  async create(room: Room): Promise<void> {
    try {
      await this.executor().insert(rooms).values(mapRoomToInsert(room));
    } catch (error) {
      // `rooms_code_uq` falls through unchanged → CreateRoom retries on a
      // fresh code (see isRoomCodeUniqueViolation).
      translateUniqueViolation(error);
    }
  }

  async update(room: Room): Promise<void> {
    await this.executor()
      .update(rooms)
      .set(mapRoomToUpdate(room))
      .where(eq(rooms.id, room.id));
  }

  async findById(id: string): Promise<Room | null> {
    const [row] = await this.executor()
      .select()
      .from(rooms)
      .where(eq(rooms.id, id))
      .limit(1);
    return row ? mapRowToRoom(row) : null;
  }

  async findByCode(code: RoomCode): Promise<Room | null> {
    const [row] = await this.executor()
      .select()
      .from(rooms)
      .where(eq(rooms.code, code.value))
      .limit(1);
    return row ? mapRowToRoom(row) : null;
  }

  async findByHostReconnectToken(token: ReconnectToken): Promise<Room | null> {
    const [row] = await this.executor()
      .select()
      .from(rooms)
      .where(eq(rooms.hostReconnectToken, token.value))
      .limit(1);
    return row ? mapRowToRoom(row) : null;
  }

  async acquireRoomLock(roomId: string): Promise<void> {
    await this.executor().execute(
      sql`select pg_advisory_xact_lock(hashtext(${roomId}))`,
    );
  }
}

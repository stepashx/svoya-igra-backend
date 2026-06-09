import { Injectable } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DrizzleDatabase } from '../../../infrastructure/database/database.types';
import { players } from '../../../infrastructure/database/schema';
import { Player } from '../../domain/entities';
import { PlayerRepositoryPort } from '../../domain/ports';
import { PlayerName, ReconnectToken } from '../../domain/value-objects';
import {
  mapPlayerToInsert,
  mapPlayerToUpdate,
  mapRowToPlayer,
} from './mappers';

/** Drizzle/PostgreSQL adapter for {@link PlayerRepositoryPort}. */
@Injectable()
export class DrizzlePlayerRepository implements PlayerRepositoryPort {
  constructor(private readonly database: DatabaseService) {}

  private get executor(): DrizzleDatabase {
    return this.database.db;
  }

  async create(player: Player): Promise<void> {
    await this.executor.insert(players).values(mapPlayerToInsert(player));
  }

  async update(player: Player): Promise<void> {
    await this.executor
      .update(players)
      .set(mapPlayerToUpdate(player))
      .where(eq(players.id, player.id));
  }

  async findById(id: string): Promise<Player | null> {
    const [row] = await this.executor
      .select()
      .from(players)
      .where(eq(players.id, id))
      .limit(1);
    return row ? mapRowToPlayer(row) : null;
  }

  async findByReconnectToken(token: ReconnectToken): Promise<Player | null> {
    const [row] = await this.executor
      .select()
      .from(players)
      .where(eq(players.reconnectToken, token.value))
      .limit(1);
    return row ? mapRowToPlayer(row) : null;
  }

  async findByRoomId(roomId: string): Promise<Player[]> {
    const rows = await this.executor
      .select()
      .from(players)
      .where(eq(players.roomId, roomId));
    return rows.map(mapRowToPlayer);
  }

  async findByRoomIdAndName(
    roomId: string,
    name: PlayerName,
  ): Promise<Player | null> {
    const [row] = await this.executor
      .select()
      .from(players)
      .where(and(eq(players.roomId, roomId), eq(players.name, name.value)))
      .limit(1);
    return row ? mapRowToPlayer(row) : null;
  }

  async findByTeamId(teamId: string): Promise<Player[]> {
    const rows = await this.executor
      .select()
      .from(players)
      .where(eq(players.teamId, teamId));
    return rows.map(mapRowToPlayer);
  }

  async countByTeamId(teamId: string): Promise<number> {
    const [row] = await this.executor
      .select({ value: count() })
      .from(players)
      .where(eq(players.teamId, teamId));
    return row?.value ?? 0;
  }
}

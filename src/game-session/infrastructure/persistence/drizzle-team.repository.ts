import { Injectable } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { DatabaseService } from '../../../infrastructure/database/database.service';
import { DrizzleDatabase } from '../../../infrastructure/database/database.types';
import { teams } from '../../../infrastructure/database/schema';
import { Team } from '../../domain/entities';
import { TeamRepositoryPort } from '../../domain/ports';
import { mapRowToTeam, mapTeamToInsert, mapTeamToUpdate } from './mappers';

/** Drizzle/PostgreSQL adapter for {@link TeamRepositoryPort}. */
@Injectable()
export class DrizzleTeamRepository implements TeamRepositoryPort {
  constructor(private readonly database: DatabaseService) {}

  private get executor(): DrizzleDatabase {
    return this.database.db;
  }

  async create(team: Team): Promise<void> {
    await this.executor.insert(teams).values(mapTeamToInsert(team));
  }

  async update(team: Team): Promise<void> {
    await this.executor
      .update(teams)
      .set(mapTeamToUpdate(team))
      .where(eq(teams.id, team.id));
  }

  async findById(id: string): Promise<Team | null> {
    const [row] = await this.executor
      .select()
      .from(teams)
      .where(eq(teams.id, id))
      .limit(1);
    return row ? mapRowToTeam(row) : null;
  }

  async findByRoomId(roomId: string): Promise<Team[]> {
    const rows = await this.executor
      .select()
      .from(teams)
      .where(eq(teams.roomId, roomId));
    return rows.map(mapRowToTeam);
  }

  async countByRoomId(roomId: string): Promise<number> {
    const [row] = await this.executor
      .select({ value: count() })
      .from(teams)
      .where(eq(teams.roomId, roomId));
    return row?.value ?? 0;
  }

  async findByRoomAndSelectedTopic(
    roomId: string,
    topicId: string,
  ): Promise<Team | null> {
    const [row] = await this.executor
      .select()
      .from(teams)
      .where(and(eq(teams.roomId, roomId), eq(teams.selectedTopicId, topicId)))
      .limit(1);
    return row ? mapRowToTeam(row) : null;
  }
}

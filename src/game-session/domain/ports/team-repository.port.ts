import { Team } from '../entities';

/**
 * Persistence port for teams (Этап2 §15). Signatures speak only in domain
 * types; the Drizzle adapter lives in infrastructure/persistence.
 */
export interface TeamRepositoryPort {
  create(team: Team): Promise<void>;
  update(team: Team): Promise<void>;
  findById(id: string): Promise<Team | null>;
  findByRoomId(roomId: string): Promise<Team[]>;
  countByRoomId(roomId: string): Promise<number>;
  findByRoomAndSelectedTopic(
    roomId: string,
    topicId: string,
  ): Promise<Team | null>;
}

export const TEAM_REPOSITORY_PORT = Symbol('TeamRepositoryPort');

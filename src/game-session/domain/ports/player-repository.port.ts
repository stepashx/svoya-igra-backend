import { Player } from '../entities';
import { PlayerName, ReconnectToken } from '../value-objects';

/**
 * Persistence port for players (Этап2 §15). Signatures speak only in domain
 * types; the Drizzle adapter lives in infrastructure/persistence.
 */
export interface PlayerRepositoryPort {
  create(player: Player): Promise<void>;
  update(player: Player): Promise<void>;
  findById(id: string): Promise<Player | null>;
  findByReconnectToken(token: ReconnectToken): Promise<Player | null>;
  findByRoomId(roomId: string): Promise<Player[]>;
  findByRoomIdAndName(roomId: string, name: PlayerName): Promise<Player | null>;
  findByTeamId(teamId: string): Promise<Player[]>;
  countByTeamId(teamId: string): Promise<number>;
}

export const PLAYER_REPOSITORY_PORT = Symbol('PlayerRepositoryPort');

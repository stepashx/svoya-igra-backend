import { Room } from '../entities';
import { ReconnectToken, RoomCode } from '../value-objects';

/**
 * Persistence port for the room aggregate (Этап2 §15). Signatures speak only in
 * domain types; the Drizzle adapter lives in infrastructure/persistence.
 */
export interface RoomRepositoryPort {
  create(room: Room): Promise<void>;
  update(room: Room): Promise<void>;
  findById(id: string): Promise<Room | null>;
  findByCode(code: RoomCode): Promise<Room | null>;
  findByHostReconnectToken(token: ReconnectToken): Promise<Room | null>;
}

export const ROOM_REPOSITORY_PORT = Symbol('RoomRepositoryPort');

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

  /**
   * Take a transaction-scoped advisory lock keyed by room id, serialising
   * concurrent mutations of one room (team/player limits, game start). Must be
   * called as the first statement inside a transaction; the lock releases on
   * commit/rollback. A no-op outside a transaction other than a brief session
   * lock, so callers always wrap it in {@link TransactionPort.run}.
   */
  acquireRoomLock(roomId: string): Promise<void>;
}

export const ROOM_REPOSITORY_PORT = Symbol('RoomRepositoryPort');

import { rooms } from '../../../../infrastructure/database/schema';
import { Room } from '../../../domain/entities';
import { ReconnectToken, RoomCode } from '../../../domain/value-objects';

type RoomRow = typeof rooms.$inferSelect;
type RoomInsert = typeof rooms.$inferInsert;

/**
 * Row → entity. Drizzle already returns camelCase keys, so there is no case
 * conversion. The `status` / `currentStage` assignments are the compile-time
 * guard between the schema union and the domain union: they only type-check
 * while the two unions are identical. Dates pass through unchanged.
 */
export function mapRowToRoom(row: RoomRow): Room {
  return Room.reconstitute({
    id: row.id,
    code: RoomCode.fromPersistence(row.code),
    status: row.status,
    currentStage: row.currentStage,
    hostId: row.hostId,
    hostReconnectToken: ReconnectToken.fromPersistence(row.hostReconnectToken),
    currentTeamId: row.currentTeamId,
    totalQuestionsCount: row.totalQuestionsCount,
    blockedQuestionsCount: row.blockedQuestionsCount,
    currentShopRound: row.currentShopRound,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  });
}

/** Entity → full insert payload (value objects unwrapped to primitives). */
export function mapRoomToInsert(room: Room): RoomInsert {
  return {
    id: room.id,
    code: room.code.value,
    status: room.status,
    currentStage: room.currentStage,
    hostId: room.hostId,
    hostReconnectToken: room.hostReconnectToken.value,
    currentTeamId: room.currentTeamId,
    totalQuestionsCount: room.totalQuestionsCount,
    blockedQuestionsCount: room.blockedQuestionsCount,
    currentShopRound: room.currentShopRound,
    createdAt: room.createdAt,
    finishedAt: room.finishedAt,
  };
}

/** Entity → partial update payload (mutable columns only). */
export function mapRoomToUpdate(room: Room): Partial<RoomInsert> {
  return {
    status: room.status,
    currentStage: room.currentStage,
    currentTeamId: room.currentTeamId,
    blockedQuestionsCount: room.blockedQuestionsCount,
    currentShopRound: room.currentShopRound,
    finishedAt: room.finishedAt,
  };
}

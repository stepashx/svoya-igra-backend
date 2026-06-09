import { players } from '../../../../infrastructure/database/schema';
import { Player } from '../../../domain/entities';
import { PlayerName, ReconnectToken } from '../../../domain/value-objects';

type PlayerRow = typeof players.$inferSelect;
type PlayerInsert = typeof players.$inferInsert;

/**
 * Row → entity. The `connectionStatus` assignment is the compile-time guard
 * between the schema union and the domain union. Nullable soft links (`teamId`)
 * and dates pass through unchanged.
 */
export function mapRowToPlayer(row: PlayerRow): Player {
  return Player.reconstitute({
    id: row.id,
    roomId: row.roomId,
    teamId: row.teamId,
    name: PlayerName.fromPersistence(row.name),
    avatar: row.avatar,
    reconnectToken: ReconnectToken.fromPersistence(row.reconnectToken),
    connectionStatus: row.connectionStatus,
    isCaptain: row.isCaptain,
    joinedAt: row.joinedAt,
    lastSeenAt: row.lastSeenAt,
  });
}

/** Entity → full insert payload (value objects unwrapped to primitives). */
export function mapPlayerToInsert(player: Player): PlayerInsert {
  return {
    id: player.id,
    roomId: player.roomId,
    teamId: player.teamId,
    name: player.name.value,
    avatar: player.avatar,
    reconnectToken: player.reconnectToken.value,
    connectionStatus: player.connectionStatus,
    isCaptain: player.isCaptain,
    joinedAt: player.joinedAt,
    lastSeenAt: player.lastSeenAt,
  };
}

/** Entity → partial update payload (mutable columns only). */
export function mapPlayerToUpdate(player: Player): Partial<PlayerInsert> {
  return {
    teamId: player.teamId,
    name: player.name.value,
    avatar: player.avatar,
    connectionStatus: player.connectionStatus,
    isCaptain: player.isCaptain,
    lastSeenAt: player.lastSeenAt,
  };
}

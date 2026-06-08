import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idPk } from '../_shared/columns';
import { CONNECTION_STATUSES } from '../_shared/enums';
import { rooms } from './rooms.table';
import { teams } from './teams.table';

/**
 * A player in a room (plan §12). Belongs to the room (cascade). The team link
 * is membership, not ownership, so it is `set null` on team deletion and the
 * column is nullable (a player exists before joining a team).
 *
 * Captaincy is a property of the player (`is_captain`); the "one captain per
 * team" rule is enforced by a partial unique index on `team_id` restricted to
 * captain rows, rather than by a uniqueness constraint on the (soft) link in
 * `teams.captain_player_id`.
 *
 * `joined_at` and `last_seen_at` are both §12 `*At` fields, so they default to
 * `now()`; `last_seen_at` is later bumped on activity.
 */
export const players = pgTable(
  'players',
  {
    id: idPk(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    avatar: text('avatar'),
    reconnectToken: text('reconnect_token').notNull(),
    connectionStatus: text('connection_status', {
      enum: CONNECTION_STATUSES,
    }).notNull(),
    isCaptain: boolean('is_captain').notNull().default(false),
    joinedAt: createdAt('joined_at'),
    lastSeenAt: createdAt('last_seen_at'),
  },
  (table) => [
    uniqueIndex('players_reconnect_token_uq').on(table.reconnectToken),
    uniqueIndex('players_room_id_name_uq').on(table.roomId, table.name),
    // One captain per team: partial unique over captain rows only.
    uniqueIndex('players_captain_per_team_uq')
      .on(table.teamId)
      .where(sql`${table.isCaptain}`),
  ],
);

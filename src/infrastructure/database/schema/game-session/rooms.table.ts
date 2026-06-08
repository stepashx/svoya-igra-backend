import { integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, idPk, tsTz } from '../_shared/columns';
import { GAME_STAGES, ROOM_STATUSES } from '../_shared/enums';

/**
 * A game room (plan §12). The aggregate root of one play session: it owns
 * players, teams, board cells, purchases, submissions, scores and results,
 * all of which cascade-delete with the room.
 *
 * `host_id` is the opaque host identity — there is no hosts/users table, so it
 * is a plain uuid, not a foreign key. `current_team_id` is a "soft" uuid (no
 * `references()`) on purpose: a real FK would create a rooms↔teams cycle, since
 * `teams.room_id` already points back here.
 *
 * `status` and `current_stage` carry no DB default — the create-room use case
 * sets them explicitly (ACTIVE / LOBBY); the schema does not invent state.
 */
export const rooms = pgTable(
  'rooms',
  {
    id: idPk(),
    code: text('code').notNull(),
    status: text('status', { enum: ROOM_STATUSES }).notNull(),
    currentStage: text('current_stage', { enum: GAME_STAGES }).notNull(),
    hostId: uuid('host_id').notNull(),
    hostReconnectToken: text('host_reconnect_token').notNull(),
    // Soft reference (no FK) — breaks the rooms↔teams cycle.
    currentTeamId: uuid('current_team_id'),
    totalQuestionsCount: integer('total_questions_count').notNull().default(30),
    blockedQuestionsCount: integer('blocked_questions_count')
      .notNull()
      .default(0),
    currentShopRound: integer('current_shop_round').notNull().default(0),
    createdAt: createdAt(),
    finishedAt: tsTz('finished_at'),
  },
  (table) => [
    uniqueIndex('rooms_code_uq').on(table.code),
    uniqueIndex('rooms_host_reconnect_token_uq').on(table.hostReconnectToken),
  ],
);

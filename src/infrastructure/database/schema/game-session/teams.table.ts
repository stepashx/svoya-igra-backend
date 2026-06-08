import {
  boolean,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, idPk } from '../_shared/columns';
import { presentationTopics } from './presentation-topics.table';
import { rooms } from './rooms.table';

/**
 * A team within a room (plan §12). Owned by the room (cascade). Keeps two
 * separate scores per §14.7: `earned_score` (used for the final result) and
 * `balance` (decreased by shop purchases).
 *
 * `captain_player_id` and `presentation_submission_id` are "soft" uuids (no
 * `references()`) to break cycles: `players.team_id` and
 * `presentation_submissions.team_id` already point back to teams. The captain
 * link is instead protected by a partial unique index on `players` (one
 * captain per team).
 *
 * `selected_topic_id` references the global topic catalog (restrict — seed rows
 * must not be deleted out from under a selection); uniqueness of a topic within
 * a room is enforced by `teams_room_id_selected_topic_id_uq`.
 */
export const teams = pgTable(
  'teams',
  {
    id: idPk(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Soft reference (no FK) — breaks the teams↔players cycle.
    captainPlayerId: uuid('captain_player_id'),
    selectedTopicId: uuid('selected_topic_id').references(
      () => presentationTopics.id,
      { onDelete: 'restrict' },
    ),
    isReady: boolean('is_ready').notNull().default(false),
    turnOrder: integer('turn_order'),
    earnedScore: integer('earned_score').notNull().default(0),
    balance: integer('balance').notNull().default(0),
    // Soft reference (no FK) — breaks the teams↔presentation_submissions cycle.
    presentationSubmissionId: uuid('presentation_submission_id'),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('teams_room_id_selected_topic_id_uq').on(
      table.roomId,
      table.selectedTopicId,
    ),
  ],
);

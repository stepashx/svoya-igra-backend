import { sql } from 'drizzle-orm';
import { integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { idPk, tsTz } from '../_shared/columns';
import { EVALUATOR_TYPES } from '../_shared/enums';
import { rooms } from '../game-session/rooms.table';
import { teams } from '../game-session/teams.table';

/**
 * One evaluator's score for one team (plan §12). An evaluator is either a TEAM
 * (`evaluator_team_id` set, `host_id` null) or the HOST (`host_id` set,
 * `evaluator_team_id` null); the host's weight is 2 and a team's weight is 1
 * (§14.10). `host_id` is the opaque host identity — a soft uuid, no FK (there
 * is no hosts table). `total_score` (= topic + design) and `weight` are stored
 * integers; the weighted average is computed at results time.
 *
 * Owned by the room (cascade). `target_team_id` cascades (a score about a
 * deleted team is meaningless); `evaluator_team_id` is an actor reference
 * (`set null`, nullable). See the open questions in the task report — §12 does
 * not specify these onDelete actions.
 *
 * Uniqueness: one score per (target, evaluator-team) pair; plus a partial
 * unique over HOST rows so each target team gets exactly one host score
 * (NULL `evaluator_team_id` would not collide in the 3-column index).
 */
export const evaluationScores = pgTable(
  'evaluation_scores',
  {
    id: idPk(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    targetTeamId: uuid('target_team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    evaluatorType: text('evaluator_type', { enum: EVALUATOR_TYPES }).notNull(),
    evaluatorTeamId: uuid('evaluator_team_id').references(() => teams.id, {
      onDelete: 'set null',
    }),
    // Soft reference (no FK) — opaque host identity, no hosts table.
    hostId: uuid('host_id'),
    topicScore: integer('topic_score').notNull(),
    designScore: integer('design_score').notNull(),
    totalScore: integer('total_score').notNull(),
    weight: integer('weight').notNull(),
    confirmedAt: tsTz('confirmed_at'),
  },
  (table) => [
    uniqueIndex('evaluation_scores_room_target_evaluator_uq').on(
      table.roomId,
      table.targetTeamId,
      table.evaluatorTeamId,
    ),
    uniqueIndex('evaluation_scores_host_per_target_uq')
      .on(table.roomId, table.targetTeamId)
      .where(sql`${table.evaluatorType} = 'HOST'`),
  ],
);

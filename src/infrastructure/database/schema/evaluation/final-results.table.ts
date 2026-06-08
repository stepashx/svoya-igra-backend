import {
  doublePrecision,
  integer,
  pgTable,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, idPk } from '../_shared/columns';
import { rooms } from '../game-session/rooms.table';
import { teams } from '../game-session/teams.table';

/**
 * The computed final result for a team (plan §12, §14.10). Owned by the room
 * and team (cascade). `final_score = earned_score × presentation_score_final`
 * (§14.10); the score fields are `double precision` (the presentation average,
 * penalty, and product are fractional), while `earned_score` and `place` are
 * integers. `calculated_at` is the result's creation stamp → `now()`.
 */
export const finalResults = pgTable(
  'final_results',
  {
    id: idPk(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    earnedScore: integer('earned_score').notNull(),
    presentationScoreRaw: doublePrecision('presentation_score_raw').notNull(),
    latePenalty: doublePrecision('late_penalty').notNull(),
    presentationScoreFinal: doublePrecision(
      'presentation_score_final',
    ).notNull(),
    finalScore: doublePrecision('final_score').notNull(),
    place: integer('place').notNull(),
    calculatedAt: createdAt('calculated_at'),
  },
  (table) => [
    uniqueIndex('final_results_room_id_team_id_uq').on(
      table.roomId,
      table.teamId,
    ),
  ],
);

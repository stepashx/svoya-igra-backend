/**
 * Evaluation schema group (Stage 5A.4).
 *
 * The end-of-game tables: the seeded `evaluation_criteria` catalog, individual
 * weighted `evaluation_scores`, and computed `final_results`. This file defines
 * the physical Drizzle tables, their constraints/indexes, and the Drizzle
 * query-API relations only. No evaluation behaviour (weighted scoring, self/
 * duplicate enforcement, final-result calculation, …) lives here — those are
 * later feature stages.
 *
 * Binding data decisions honoured here (see master context §8/§10 / Stage 5A
 * plan §7/§8):
 *   - `evaluation_criteria` is a required/static seeded catalog, referenced only
 *     conceptually by scoring (no `criterionId` FK on `evaluation_scores`, per
 *     the plan's topic/design score model).
 *   - Evaluator identity is polymorphic: `evaluatorType` (shared enum) plus
 *     `evaluatorId`, which holds either the opaque `rooms.hostId` or a team id.
 *     It is therefore NOT a foreign key; both identities are UUID-typed so one
 *     `evaluatorId` column accepts either. Referential validity for the team
 *     case is application-enforced — there is NO `hosts` table to FK against.
 *   - `final_results.earnedScore` mirrors `teams.earnedScore` (points only;
 *     purchases never reduce it). `finalScore = earnedScore ×
 *     presentationScoreFinal` is computed by the application layer, not here.
 *
 * Evaluator-type vocabulary is defined once in `../shared/enums` and reused
 * here, never redeclared.
 */
import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { EVALUATOR_TYPES, primaryId, timestamps } from '../shared';
import { rooms, teams } from '../game-session';

/**
 * An evaluation dimension (e.g. topic coverage, design) with its 0–10 range.
 * Global, static, seeded catalog with a fixed display `order`. The 0–10 range is
 * application-enforced at scoring time.
 */
export const evaluationCriteria = pgTable(
  'evaluation_criteria',
  {
    id: primaryId(),
    title: text('title').notNull(),
    description: text('description'),
    minScore: integer('min_score').notNull().default(0),
    maxScore: integer('max_score').notNull().default(10),
    order: integer('order').notNull(),
  },
  (table) => [
    // Criterion ordering is an identity within the catalog.
    unique('evaluation_criteria_order_unique').on(table.order),
  ],
);

/**
 * One evaluator's score for one target team in a room. Whole-number score fields
 * (`topicScore`, `designScore`, `totalScore`, `weight`); `weight` derives from
 * `evaluatorType` (stored for a stable record). `confirmedAt` is null until the
 * score is confirmed; a score cannot change after confirmation (app-enforced).
 */
export const evaluationScores = pgTable(
  'evaluation_scores',
  {
    id: primaryId(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    targetTeamId: uuid('target_team_id')
      .notNull()
      .references(() => teams.id),
    evaluatorType: text('evaluator_type', { enum: EVALUATOR_TYPES }).notNull(),
    // Polymorphic evaluator identity (host id OR team id); intentionally NOT a
    // foreign key. UUID-typed so it accepts either kind of identity.
    evaluatorId: uuid('evaluator_id').notNull(),
    topicScore: integer('topic_score').notNull(),
    designScore: integer('design_score').notNull(),
    totalScore: integer('total_score').notNull(),
    weight: integer('weight').notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    // No duplicate evaluation from the same evaluator to the same target team.
    unique('evaluation_scores_evaluator_target_unique').on(
      table.roomId,
      table.targetTeamId,
      table.evaluatorType,
      table.evaluatorId,
    ),
    // Per-target score reads (result calculation) are the common lookup path.
    index('evaluation_scores_room_id_target_team_id_idx').on(
      table.roomId,
      table.targetTeamId,
    ),
  ],
);

/**
 * The computed result for one team in a room. Presentation-scoring fields are
 * numeric/decimal (the formulas divide by 3 or 4, so they can be fractional);
 * `earnedScore` and `place` are whole numbers. One result row per team per room.
 */
export const finalResults = pgTable(
  'final_results',
  {
    id: primaryId(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    earnedScore: integer('earned_score').notNull(),
    presentationScoreRaw: numeric('presentation_score_raw', {
      precision: 10,
      scale: 2,
    }).notNull(),
    latePenalty: numeric('late_penalty', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    presentationScoreFinal: numeric('presentation_score_final', {
      precision: 10,
      scale: 2,
    }).notNull(),
    finalScore: numeric('final_score', { precision: 10, scale: 2 }).notNull(),
    place: integer('place'),
    calculatedAt: timestamp('calculated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    // One final result per team per room.
    unique('final_results_room_id_team_id_unique').on(
      table.roomId,
      table.teamId,
    ),
    // Room-scoped reads (final standings) are the common lookup path.
    index('final_results_room_id_idx').on(table.roomId),
  ],
);

export const evaluationCriteriaRelations = relations(
  evaluationCriteria,
  () => ({}),
);

/**
 * Relations for the Drizzle query API. Only the FK-holding side is declared (the
 * polymorphic `evaluatorId` is not an FK, so it has no relation), keeping the
 * accepted game-session relations untouched.
 */
export const evaluationScoresRelations = relations(
  evaluationScores,
  ({ one }) => ({
    room: one(rooms, {
      fields: [evaluationScores.roomId],
      references: [rooms.id],
    }),
    targetTeam: one(teams, {
      fields: [evaluationScores.targetTeamId],
      references: [teams.id],
    }),
  }),
);

export const finalResultsRelations = relations(finalResults, ({ one }) => ({
  room: one(rooms, {
    fields: [finalResults.roomId],
    references: [rooms.id],
  }),
  team: one(teams, {
    fields: [finalResults.teamId],
    references: [teams.id],
  }),
}));

/**
 * Gameplay schema group (Stage 5A.3).
 *
 * The board-content tables: the seeded `categories` and `questions` catalog and
 * the per-room `board_cells` that instantiate the 6×5 grid. This file defines
 * the physical Drizzle tables, their constraints/indexes, and the Drizzle
 * query-API relations only. No gameplay behaviour (board generation, question
 * selection/opening, host-only answer reveal, scoring, cell blocking, turn
 * rotation, shop triggers, …) lives here — those are later feature stages.
 *
 * Binding data decisions honoured here (see master context §8/§10 / Stage 5A
 * plan §7):
 *   - `categories` (6) and `questions` (30, five per category by value) are a
 *     required/static seeded catalog. `questions.correctAnswer` is backend-only
 *     and never sent to players before/during the answer (application-enforced).
 *   - `board_cells.categoryId` and `board_cells.points` are an INTENTIONAL
 *     per-room snapshot (faster board/reconnect reads, stable against later
 *     catalog edits). They are NOT redundant — do not remove them.
 *   - One cell per room/question via `(roomId, questionId)`.
 *   - `board_cells` is runtime-created at game start (Gameplay's StartGame), not
 *     seeded.
 *
 * Board cell state vocabulary is defined once in `../shared/enums` and reused
 * here, never redeclared.
 */
import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { BOARD_CELL_STATES, primaryId, timestamps } from '../shared';
import { rooms, teams } from '../game-session';

/**
 * One of the 6 board categories (a column of the grid). Global, static, seeded
 * catalog with a fixed display `position`.
 */
export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    // Category column position is an identity within the board.
    unique('categories_position_unique').on(table.position),
  ],
);

/**
 * A board question with its backend-only correct answer and point value. Global,
 * static, seeded catalog (30 total — five per category at values
 * 100/200/400/600/800). `points` is a whole number; `correctAnswer` is held only
 * here and revealed to the host only after the team answers.
 */
export const questions = pgTable(
  'questions',
  {
    id: primaryId(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    text: text('text').notNull(),
    correctAnswer: text('correct_answer').notNull(),
    points: integer('points').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    // Exactly one question per value within a category (the 5-per-category board
    // shape); a DB guarantee on top of the seed content.
    unique('questions_category_id_points_unique').on(
      table.categoryId,
      table.points,
    ),
    // Category-scoped reads (board assembly) are the common lookup path.
    index('questions_category_id_idx').on(table.categoryId),
  ],
);

/**
 * A per-room instance of a question on the 6×5 board, with its state. Runtime-
 * created at game start. `categoryId`/`points` are the intentional snapshot;
 * `openedByTeamId`/`answeredByTeamId`/`blockedAt` are nullable until those events
 * occur. State defaults to `available`.
 */
export const boardCells = pgTable(
  'board_cells',
  {
    id: primaryId(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    // Snapshot of the question's category/points at board-generation time.
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    points: integer('points').notNull(),
    position: integer('position').notNull(),
    state: text('state', { enum: BOARD_CELL_STATES })
      .notNull()
      .default('available'),
    openedByTeamId: uuid('opened_by_team_id').references(() => teams.id),
    answeredByTeamId: uuid('answered_by_team_id').references(() => teams.id),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    // One board cell per room/question.
    unique('board_cells_room_id_question_id_unique').on(
      table.roomId,
      table.questionId,
    ),
    // Room-scoped reads (board render on reconnect) are the common lookup path.
    index('board_cells_room_id_idx').on(table.roomId),
  ],
);

export const categoriesRelations = relations(categories, ({ many }) => ({
  questions: many(questions),
  boardCells: many(boardCells),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  category: one(categories, {
    fields: [questions.categoryId],
    references: [categories.id],
  }),
  boardCells: many(boardCells),
}));

/**
 * Relations for the Drizzle query API. Only the FK-holding side is declared so
 * the accepted game-session relations stay untouched. The two distinct
 * board_cell→team references (opened/answered) are disambiguated with explicit
 * `relationName`s.
 */
export const boardCellsRelations = relations(boardCells, ({ one }) => ({
  room: one(rooms, {
    fields: [boardCells.roomId],
    references: [rooms.id],
  }),
  question: one(questions, {
    fields: [boardCells.questionId],
    references: [questions.id],
  }),
  category: one(categories, {
    fields: [boardCells.categoryId],
    references: [categories.id],
  }),
  openedByTeam: one(teams, {
    fields: [boardCells.openedByTeamId],
    references: [teams.id],
    relationName: 'board_cell_opened_by',
  }),
  answeredByTeam: one(teams, {
    fields: [boardCells.answeredByTeamId],
    references: [teams.id],
    relationName: 'board_cell_answered_by',
  }),
}));

/**
 * Gameplay schema group (Stage 5A.3).
 *
 * The static question content (`categories`, `questions`) plus its per-room
 * instantiation (`board_cells`). This file defines the physical Drizzle tables,
 * their constraints/indexes, and the Drizzle query-API relations only. No
 * gameplay behaviour (board generation, SelectQuestion, scoring, cell blocking,
 * turns, …) lives here — that is Stage 6.
 *
 * Binding data decisions honoured here (see master context §8 / Stage 5A plan):
 *   - `board_cells.categoryId` and `board_cells.points` are an INTENTIONAL
 *     per-room snapshot of the board (faster board/reconnect reads, stable
 *     against later catalog edits). Do NOT remove them as "redundant".
 *   - `questions.correctAnswer` is held only here and is never exposed to players
 *     before/during an answer — that visibility rule is application-enforced.
 *   - One board cell per room/question via `(roomId, questionId)`.
 *
 * Board cell state vocabulary is defined once in `../shared/enums` and reused
 * here, never redeclared. `categories`/`questions` are seeded; `board_cells` are
 * runtime-created at game start.
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
import { BOARD_CELL_STATES, primaryId } from '../shared';
import { rooms, teams } from '../game-session';

/**
 * One of the 6 board categories. `position` fixes the board column order and is
 * unique so categories render in a stable, distinct order. Seeded.
 */
export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    title: text('title').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    // Stable, distinct column ordering for the board (also the display/order
    // lookup path).
    unique('categories_position_unique').on(table.position),
  ],
);

/**
 * A board question with its backend-only correct answer and point value. Belongs
 * to a category; referenced (and snapshotted) by board cells. Seeded — 30 total,
 * five per category by value (100/200/400/600/800).
 */
export const questions = pgTable(
  'questions',
  {
    id: primaryId(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    text: text('text').notNull(),
    // Held only here; revealed to the host only after the team answers
    // (application-enforced visibility rule).
    correctAnswer: text('correct_answer').notNull(),
    points: integer('points').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    // One question per value per category — enforces the five-distinct-values
    // board shape and serves the "questions by category" lookup via the leading
    // column, so a separate category index would be redundant.
    unique('questions_category_id_points_unique').on(
      table.categoryId,
      table.points,
    ),
  ],
);

/**
 * A per-room instance of a question on the 6×5 board, with its state.
 * `categoryId`/`points` are an intentional snapshot (see file header).
 * `openedByTeamId`/`answeredByTeamId`/`blockedAt` are nullable until those
 * events occur. Runtime-created at game start.
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
    // Snapshot references — intentionally denormalised; do not remove.
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
  },
  (table) => [
    // One cell per room/question.
    unique('board_cells_room_id_question_id_unique').on(
      table.roomId,
      table.questionId,
    ),
    // Room-scoped board reads (rendering / reconnect) are the hot path.
    index('board_cells_room_id_idx').on(table.roomId),
  ],
);

/**
 * Relations for the Drizzle query API. Board cells reference teams twice
 * (opening vs answering), so each is disambiguated with an explicit
 * `relationName`.
 */
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
    relationName: 'board_cell_opened_by_team',
  }),
  answeredByTeam: one(teams, {
    fields: [boardCells.answeredByTeamId],
    references: [teams.id],
    relationName: 'board_cell_answered_by_team',
  }),
}));

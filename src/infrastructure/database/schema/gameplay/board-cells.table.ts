import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { idPk, tsTz } from '../_shared/columns';
import { BOARD_CELL_STATES } from '../_shared/enums';
import { rooms } from '../game-session/rooms.table';
import { teams } from '../game-session/teams.table';
import { categories } from './categories.table';
import { questions } from './questions.table';

/**
 * One cell of a room's 6×5 board (plan §12). Owned by the room (cascade). The
 * question/category come from the seed catalog (`restrict` — seeds are not
 * deleted under a live game). The actor links (`opened_by_team_id`,
 * `answered_by_team_id`) are informational membership references: `set null`
 * and nullable.
 *
 * `state` carries no DB default — the board-init use case seeds every cell as
 * `AVAILABLE` explicitly. `blocked_at` is an event timestamp (set when the cell
 * is blocked), so it is plain `tsTz`, not a creation stamp.
 */
export const boardCells = pgTable('board_cells', {
  id: idPk(),
  roomId: uuid('room_id')
    .notNull()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id')
    .notNull()
    .references(() => questions.id, { onDelete: 'restrict' }),
  categoryId: uuid('category_id')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  points: integer('points').notNull(),
  position: integer('position').notNull(),
  state: text('state', { enum: BOARD_CELL_STATES }).notNull(),
  openedByTeamId: uuid('opened_by_team_id').references(() => teams.id, {
    onDelete: 'set null',
  }),
  answeredByTeamId: uuid('answered_by_team_id').references(() => teams.id, {
    onDelete: 'set null',
  }),
  blockedAt: tsTz('blocked_at'),
});

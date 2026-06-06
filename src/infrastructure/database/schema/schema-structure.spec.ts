/**
 * Schema structure verification (Stage 5A.8).
 *
 * A DB-free, introspection-based contract test over the Drizzle schema — the
 * single source of truth the migrations are generated from. By reading the
 * compiled table objects (`getTableConfig`) rather than a live database, these
 * checks run in `npm test` with no PostgreSQL, yet still prove the binding data
 * decisions hold: the exact 16 MVP tables exist, the key foreign keys and unique
 * constraints are declared, the intentional board-cell snapshot survives, and —
 * crucially — every element the master context forbids stays absent (no `hosts`
 * or `files` table, no `players.isCaptain`, no purchase-state on `shop_items`,
 * no `assignedTeamId`/`presentationSubmissionId` back-references).
 *
 * Real constraint *enforcement* (a duplicate insert being rejected) needs a
 * database and is covered by the environment-gated integration test
 * (`data-layer.integration.spec.ts`); the committed migration SQL is guarded
 * against drift from this schema by `../migrations/migration-consistency.spec.ts`.
 */
import { getTableName, is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from './index';
import {
  EXPECTED_TABLE_NAMES,
  FORBIDDEN_TABLE_NAMES,
} from '../data-layer.tables';

/** The 16 MVP tables, by their physical (snake_case) names. */
const EXPECTED_TABLES = EXPECTED_TABLE_NAMES;

/** Tables the master context explicitly forbids in the MVP. */
const FORBIDDEN_TABLES = FORBIDDEN_TABLE_NAMES;

/** Introspected view of one table's columns, uniques, and foreign keys. */
interface TableShape {
  columns: Set<string>;
  /** Every unique constraint name — inline `.unique()` and composite. */
  uniqueNames: Set<string>;
  /** Composite unique constraints, by the ordered column tuple they cover. */
  compositeUniques: string[][];
  /** Foreign keys as `column -> foreignTable.foreignColumn` strings. */
  foreignKeys: string[];
}

/** Index the schema barrel's exported tables by physical name. */
const tablesByName = new Map<string, PgTable>();
for (const value of Object.values(schema)) {
  if (is(value, PgTable)) {
    tablesByName.set(getTableName(value), value as PgTable);
  }
}

function shapeOf(name: string): TableShape {
  const table = tablesByName.get(name);
  if (!table) {
    throw new Error(`table "${name}" is not exported from the schema barrel`);
  }
  const config = getTableConfig(table);

  const uniqueNames = new Set<string>();
  const compositeUniques: string[][] = [];
  for (const column of config.columns) {
    if (column.isUnique && column.uniqueName)
      uniqueNames.add(column.uniqueName);
  }
  for (const unique of config.uniqueConstraints) {
    if (unique.name) uniqueNames.add(unique.name);
    compositeUniques.push(unique.columns.map((c) => c.name));
  }

  const foreignKeys: string[] = [];
  for (const fk of config.foreignKeys) {
    const ref = fk.reference();
    const foreignTable = getTableName(ref.foreignTable);
    ref.columns.forEach((column, i) => {
      foreignKeys.push(
        `${column.name} -> ${foreignTable}.${ref.foreignColumns[i].name}`,
      );
    });
  }

  return {
    columns: new Set(config.columns.map((c) => c.name)),
    uniqueNames,
    compositeUniques,
    foreignKeys,
  };
}

describe('schema structure (Stage 5A.8)', () => {
  describe('the 16 MVP tables', () => {
    it('exports exactly the expected tables — no more, no fewer', () => {
      const actual = [...tablesByName.keys()].sort();
      expect(actual).toEqual([...EXPECTED_TABLES].sort());
      expect(tablesByName.size).toBe(16);
    });

    it.each([...EXPECTED_TABLES])('declares "%s"', (name) => {
      expect(tablesByName.has(name)).toBe(true);
    });

    it('declares none of the forbidden tables', () => {
      for (const forbidden of FORBIDDEN_TABLES) {
        expect(tablesByName.has(forbidden)).toBe(false);
      }
    });
  });

  describe('key unique constraints', () => {
    // Every uniqueness rule from the constraint matrix (master context §12 /
    // Stage 5A plan §10), keyed by the table that owns it.
    const expected: Record<string, string[]> = {
      rooms: ['rooms_code_unique', 'rooms_host_reconnect_token_unique'],
      players: [
        'players_reconnect_token_unique',
        'players_room_id_name_unique',
      ],
      teams: ['teams_room_id_selected_topic_id_unique'],
      board_cells: ['board_cells_room_id_question_id_unique'],
      qr_tools: ['qr_tools_storage_key_unique'],
      purchases: ['purchases_room_id_shop_item_id_unique'],
      inventory_items: ['inventory_items_room_id_team_id_shop_item_id_unique'],
      presentation_submissions: [
        'presentation_submissions_room_id_team_id_unique',
      ],
      evaluation_scores: ['evaluation_scores_evaluator_target_unique'],
      final_results: ['final_results_room_id_team_id_unique'],
    };

    it.each(Object.entries(expected))(
      '%s declares its unique constraints',
      (table, names) => {
        const { uniqueNames } = shapeOf(table);
        for (const name of names) {
          expect(uniqueNames.has(name)).toBe(true);
        }
      },
    );

    it('keys the evaluation no-duplicate rule on the full polymorphic 4-tuple', () => {
      const { compositeUniques } = shapeOf('evaluation_scores');
      expect(compositeUniques).toContainEqual([
        'room_id',
        'target_team_id',
        'evaluator_type',
        'evaluator_id',
      ]);
    });
  });

  describe('key foreign keys', () => {
    const expected: Record<string, string[]> = {
      players: ['room_id -> rooms.id', 'team_id -> teams.id'],
      teams: [
        'room_id -> rooms.id',
        'captain_player_id -> players.id',
        'selected_topic_id -> presentation_topics.id',
      ],
      rooms: ['current_team_id -> teams.id'],
      questions: ['category_id -> categories.id'],
      board_cells: [
        'room_id -> rooms.id',
        'question_id -> questions.id',
        'category_id -> categories.id',
      ],
      shop_items: ['qr_tool_id -> qr_tools.id'],
      purchases: [
        'room_id -> rooms.id',
        'team_id -> teams.id',
        'shop_item_id -> shop_items.id',
      ],
      inventory_items: [
        'room_id -> rooms.id',
        'team_id -> teams.id',
        'shop_item_id -> shop_items.id',
        'qr_tool_id -> qr_tools.id',
      ],
      presentation_submissions: [
        'room_id -> rooms.id',
        'team_id -> teams.id',
        'uploaded_by_player_id -> players.id',
      ],
      evaluation_scores: ['room_id -> rooms.id', 'target_team_id -> teams.id'],
      final_results: ['room_id -> rooms.id', 'team_id -> teams.id'],
    };

    it.each(Object.entries(expected))(
      '%s declares its foreign keys',
      (table, fks) => {
        const actual = shapeOf(table).foreignKeys;
        for (const fk of fks) {
          expect(actual).toContain(fk);
        }
      },
    );

    it('does NOT model the polymorphic evaluator id as a foreign key', () => {
      // `evaluatorId` holds either rooms.hostId OR a team id, so it must not be a
      // single FK; the only FKs on evaluation_scores are room + target team.
      expect(shapeOf('evaluation_scores').foreignKeys).toEqual([
        'room_id -> rooms.id',
        'target_team_id -> teams.id',
      ]);
    });
  });

  describe('intentional board-cell snapshot is preserved', () => {
    it('keeps category_id and points on board_cells (do not remove as redundant)', () => {
      const { columns } = shapeOf('board_cells');
      expect(columns.has('category_id')).toBe(true);
      expect(columns.has('points')).toBe(true);
    });
  });

  describe('forbidden schema elements stay absent', () => {
    const forbiddenColumns: Record<string, string[]> = {
      // Captaincy is derived from teams.captainPlayerId, never stored.
      players: ['is_captain'],
      // Selection lives on teams.selectedTopicId; the catalog has no back-ref.
      presentation_topics: ['assigned_team_id'],
      // Submission is queried by (roomId, teamId); no back-ref on teams.
      teams: ['presentation_submission_id'],
      // Availability is derived from purchases; shop_items is a pure catalog.
      shop_items: ['is_purchased', 'purchased_by_team_id', 'purchased_at'],
    };

    it.each(Object.entries(forbiddenColumns))(
      '%s carries none of its forbidden columns',
      (table, columns) => {
        const { columns: actual } = shapeOf(table);
        for (const column of columns) {
          expect(actual.has(column)).toBe(false);
        }
      },
    );

    it('keeps host identity on rooms (no hosts table)', () => {
      const { columns } = shapeOf('rooms');
      expect(columns.has('host_id')).toBe(true);
      expect(columns.has('host_reconnect_token')).toBe(true);
    });
  });

  describe('every table carries a primary key', () => {
    it.each([...EXPECTED_TABLES])('%s has an "id" column', (name) => {
      expect(shapeOf(name).columns.has('id')).toBe(true);
    });
  });
});

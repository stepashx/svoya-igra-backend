import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './index';

/**
 * Structural guard: pure Drizzle introspection, no database. Pins the exact set
 * of 16 MVP tables (plan §19), proves none of the explicitly-excluded tables
 * leaked in, and checks every table has a primary key.
 */
// `schema` re-exports tables and enum arrays; widen before narrowing to tables.
const schemaValues: unknown[] = Object.values(schema);
const allTables = schemaValues.filter((value): value is PgTable =>
  is(value, PgTable),
);

const tableNames = allTables.map((table) => getTableName(table)).sort();

const EXPECTED_TABLES = [
  // game-session
  'rooms',
  'players',
  'teams',
  'presentation_topics',
  // gameplay
  'categories',
  'questions',
  'board_cells',
  // commerce
  'qr_tools',
  'shop_items',
  'purchases',
  'inventory_items',
  // presentation
  'presentation_requirements',
  'presentation_submissions',
  // evaluation
  'evaluation_criteria',
  'evaluation_scores',
  'final_results',
].sort();

// Tables the plan §19 says NOT to build in MVP.
const FORBIDDEN_TABLES = [
  'score_operations',
  'room_events',
  'audit_logs',
  'file_access_logs',
  'advanced_sessions',
];

describe('schema structure', () => {
  it('defines exactly the 16 MVP tables', () => {
    expect(tableNames).toEqual(EXPECTED_TABLES);
    expect(tableNames).toHaveLength(16);
  });

  it('contains none of the excluded (non-MVP) tables', () => {
    for (const forbidden of FORBIDDEN_TABLES) {
      expect(tableNames).not.toContain(forbidden);
    }
  });

  it('gives every table a primary key', () => {
    for (const table of allTables) {
      const { columns, primaryKeys } = getTableConfig(table);
      const hasPk =
        columns.some((column) => column.primary) || primaryKeys.length > 0;
      expect(hasPk).toBe(true);
    }
  });
});

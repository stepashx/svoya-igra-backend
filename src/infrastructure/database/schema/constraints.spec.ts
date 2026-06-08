import { getTableName, is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from './index';

/**
 * Constraint guard: pure introspection. Pins the EXACT set of unique indexes
 * (plan §19 minimal set — no more), the two partial uniques, and the onDelete
 * action of every foreign key.
 */
// `schema` re-exports tables and enum arrays; widen before narrowing to tables.
const schemaValues: unknown[] = Object.values(schema);
const allTables = schemaValues.filter((value): value is PgTable =>
  is(value, PgTable),
);

const tablesByName = new Map(
  allTables.map((table) => [getTableName(table), table]),
);

function table(name: string): PgTable {
  const found = tablesByName.get(name);
  if (!found) {
    throw new Error(`table ${name} not found`);
  }
  return found;
}

// Every unique index in the schema, as `<table>.<indexName>`.
const uniqueIndexNames = allTables
  .flatMap((t) =>
    getTableConfig(t)
      .indexes.filter((idx) => idx.config.unique)
      .map((idx) => idx.config.name ?? '<unnamed>'),
  )
  .sort();

const EXPECTED_UNIQUE_INDEXES = [
  // core
  'rooms_code_uq',
  'rooms_host_reconnect_token_uq',
  'players_reconnect_token_uq',
  'players_room_id_name_uq',
  'players_captain_per_team_uq',
  'teams_room_id_selected_topic_id_uq',
  'purchases_room_id_shop_item_id_uq',
  'evaluation_scores_room_target_evaluator_uq',
  // recommended
  'shop_items_qr_tool_id_uq',
  'evaluation_scores_host_per_target_uq',
  'presentation_submissions_room_id_team_id_uq',
  'final_results_room_id_team_id_uq',
].sort();

// [table, localColumn, expected onDelete]
const FK_ON_DELETE: Array<[string, string, string]> = [
  ['players', 'room_id', 'cascade'],
  ['players', 'team_id', 'set null'],
  ['teams', 'room_id', 'cascade'],
  ['teams', 'selected_topic_id', 'restrict'],
  ['questions', 'category_id', 'restrict'],
  ['board_cells', 'room_id', 'cascade'],
  ['board_cells', 'question_id', 'restrict'],
  ['board_cells', 'category_id', 'restrict'],
  ['board_cells', 'opened_by_team_id', 'set null'],
  ['board_cells', 'answered_by_team_id', 'set null'],
  ['shop_items', 'qr_tool_id', 'restrict'],
  ['purchases', 'room_id', 'cascade'],
  ['purchases', 'team_id', 'cascade'],
  ['purchases', 'shop_item_id', 'restrict'],
  ['inventory_items', 'room_id', 'cascade'],
  ['inventory_items', 'team_id', 'cascade'],
  ['inventory_items', 'shop_item_id', 'restrict'],
  ['inventory_items', 'qr_tool_id', 'restrict'],
  ['presentation_submissions', 'room_id', 'cascade'],
  ['presentation_submissions', 'team_id', 'cascade'],
  ['presentation_submissions', 'uploaded_by_player_id', 'set null'],
  ['evaluation_scores', 'room_id', 'cascade'],
  ['evaluation_scores', 'target_team_id', 'cascade'],
  ['evaluation_scores', 'evaluator_team_id', 'set null'],
  ['final_results', 'room_id', 'cascade'],
  ['final_results', 'team_id', 'cascade'],
];

function onDeleteFor(
  tableName: string,
  localColumn: string,
): string | undefined {
  const fk = getTableConfig(table(tableName)).foreignKeys.find((foreignKey) =>
    foreignKey.reference().columns.some((c) => c.name === localColumn),
  );
  return fk?.onDelete;
}

describe('schema constraints', () => {
  it('declares exactly the expected unique indexes — no more', () => {
    expect(uniqueIndexNames).toEqual(EXPECTED_UNIQUE_INDEXES);
    expect(uniqueIndexNames).toHaveLength(12);
  });

  it('makes the captain and host uniques partial (WHERE clause)', () => {
    const partials = ['players', 'evaluation_scores'].flatMap((name) =>
      getTableConfig(table(name)).indexes.filter(
        (idx) => idx.config.unique && idx.config.where !== undefined,
      ),
    );
    const partialNames = partials.map((idx) => idx.config.name).sort();
    expect(partialNames).toEqual(
      [
        'evaluation_scores_host_per_target_uq',
        'players_captain_per_team_uq',
      ].sort(),
    );
  });

  it('sets the expected onDelete action on every foreign key', () => {
    for (const [tableName, localColumn, expected] of FK_ON_DELETE) {
      expect(onDeleteFor(tableName, localColumn)).toBe(expected);
    }
  });
});

import { getTableConfig, PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { finalResults, players, questions, rooms, teams } from './index';

/**
 * Column-level guard: pure introspection. Checks the load-bearing types,
 * nullability, and the "soft" uuid links that intentionally carry no FK.
 */
function column(table: PgTable, dbName: string): PgColumn {
  const found = getTableConfig(table).columns.find((c) => c.name === dbName);
  if (!found) {
    throw new Error(`column ${dbName} not found`);
  }
  return found;
}

function hasForeignKey(table: PgTable, dbName: string): boolean {
  return getTableConfig(table).foreignKeys.some((fk) =>
    fk.reference().columns.some((c) => c.name === dbName),
  );
}

describe('schema columns', () => {
  it('keeps the room code NOT NULL', () => {
    expect(column(rooms, 'code').notNull).toBe(true);
    expect(column(rooms, 'code').getSQLType()).toBe('text');
  });

  it("keeps a question's correct answer NOT NULL", () => {
    expect(column(questions, 'correct_answer').notNull).toBe(true);
    expect(column(questions, 'correct_answer').getSQLType()).toBe('text');
  });

  it('stores team earned_score and balance as NOT NULL integers', () => {
    for (const name of ['earned_score', 'balance']) {
      const col = column(teams, name);
      expect(col.getSQLType()).toBe('integer');
      expect(col.notNull).toBe(true);
    }
  });

  it('stores final-result presentation/final scores as double precision', () => {
    for (const name of [
      'presentation_score_raw',
      'presentation_score_final',
      'final_score',
    ]) {
      expect(column(finalResults, name).getSQLType()).toBe('double precision');
    }
    // earned_score and place stay integers even on final_results.
    expect(column(finalResults, 'earned_score').getSQLType()).toBe('integer');
    expect(column(finalResults, 'place').getSQLType()).toBe('integer');
  });

  it('models the cycle-breaking links as uuid columns with no FK', () => {
    const softLinks: Array<[PgTable, string]> = [
      [rooms, 'current_team_id'],
      [teams, 'captain_player_id'],
      [teams, 'presentation_submission_id'],
    ];
    for (const [table, name] of softLinks) {
      expect(column(table, name).getSQLType()).toBe('uuid');
      expect(hasForeignKey(table, name)).toBe(false);
    }
  });

  it('generates uuid primary keys with a default', () => {
    for (const table of [rooms, players, teams]) {
      const id = column(table, 'id');
      expect(id.getSQLType()).toBe('uuid');
      expect(id.primary).toBe(true);
      expect(id.hasDefault).toBe(true);
    }
  });
});

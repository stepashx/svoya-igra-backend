/**
 * Migration ↔ schema consistency (Stage 5A.8).
 *
 * A DB-free drift guard: it reads the committed migration SQL and journal and
 * asserts they actually cover the schema that generated them. The Drizzle schema
 * is the source of truth (see `../schema/schema-structure.spec.ts`); this test
 * makes sure the migration a developer would apply to a fresh database matches
 * it — every table has a `CREATE TABLE`, every declared unique constraint and
 * foreign key is present in the SQL, and no forbidden table/column leaked in.
 *
 * It does NOT replace running migrations against a real PostgreSQL (the gated
 * `data-layer.integration.spec.ts` does that); it cheaply catches the common
 * failure mode of editing a schema file and forgetting to regenerate/commit the
 * migration, which no amount of mocked unit testing would otherwise notice.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getTableName, is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../schema';

const MIGRATIONS_DIR = __dirname;

interface Journal {
  entries: { idx: number; tag: string }[];
}

/** The combined SQL of every committed migration, in journal order. */
function readMigrationSql(): string {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as Journal;

  return journal.entries
    .map((entry) =>
      readFileSync(join(MIGRATIONS_DIR, `${entry.tag}.sql`), 'utf8'),
    )
    .join('\n');
}

const sql = readMigrationSql();

/** Every schema table object, indexed by physical name. */
const tables = new Map<string, PgTable>();
for (const value of Object.values(schema)) {
  if (is(value, PgTable)) tables.set(getTableName(value), value as PgTable);
}

describe('migration ↔ schema consistency (Stage 5A.8)', () => {
  it('has at least one committed migration referenced by the journal', () => {
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
    ) as Journal;
    expect(journal.entries.length).toBeGreaterThanOrEqual(1);

    const sqlFiles = readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.endsWith('.sql'),
    );
    for (const entry of journal.entries) {
      expect(sqlFiles).toContain(`${entry.tag}.sql`);
    }
  });

  it('creates every schema table exactly once', () => {
    for (const name of tables.keys()) {
      const matches = sql.match(new RegExp(`CREATE TABLE "${name}"`, 'g'));
      expect(matches?.length ?? 0).toBe(1);
    }
  });

  it('declares every schema unique constraint in the SQL', () => {
    for (const table of tables.values()) {
      const config = getTableConfig(table);
      const names = [
        ...config.columns
          .filter((c) => c.isUnique && c.uniqueName)
          .map((c) => c.uniqueName as string),
        ...config.uniqueConstraints.map((u) => u.name),
      ];
      for (const name of names) {
        expect(sql).toContain(`"${name}"`);
      }
    }
  });

  it('declares every schema foreign key in the SQL', () => {
    for (const table of tables.values()) {
      const config = getTableConfig(table);
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        const foreignTable = getTableName(ref.foreignTable);
        // Match the column + referenced table, tolerant of Drizzle's exact
        // constraint-name format, so the FK genuinely targets the right table.
        for (let i = 0; i < ref.columns.length; i++) {
          const column = ref.columns[i].name;
          const pattern = new RegExp(
            `FOREIGN KEY \\("${column}"\\) REFERENCES "public"\\."${foreignTable}"`,
          );
          expect(sql).toMatch(pattern);
        }
      }
    }
  });

  it('contains no forbidden tables or columns', () => {
    expect(sql).not.toMatch(/CREATE TABLE "hosts"/);
    expect(sql).not.toMatch(/CREATE TABLE "files"/);
    // Forbidden columns (snake_case) must never appear in any CREATE TABLE.
    for (const column of [
      'is_captain',
      'assigned_team_id',
      'presentation_submission_id',
      'is_purchased',
      'purchased_by_team_id',
    ]) {
      expect(sql).not.toContain(`"${column}"`);
    }
  });
});

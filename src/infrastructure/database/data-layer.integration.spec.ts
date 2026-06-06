/**
 * Data-layer integration test (Stage 5A.8) — environment-gated.
 *
 * Unlike the rest of `npm test` (unit-level and mocked), this exercises the data
 * layer against a REAL, disposable PostgreSQL: it applies the committed
 * migrations to an empty database, confirms the 16 tables exist, runs the
 * required static seeds and checks their counts, and proves the key unique and
 * foreign-key constraints are actually enforced by the database (not merely
 * declared in the schema, which `schema/schema-structure.spec.ts` covers).
 *
 * It is **skipped unless `DATABASE_TEST_URL` is set** — so the default
 * `npm test`/CI run stays DB-free and green, while the CI `db-checks` job (and a
 * developer locally) can point it at a throwaway database. Every runtime row it
 * creates is written inside a transaction that is always rolled back, so it
 * never leaves rooms/players/teams/etc. behind; only the idempotent static
 * catalog seeds persist, which is expected on a disposable test database.
 *
 * MinIO is intentionally NOT required here: the seed composes QR metadata from
 * config without connecting to object storage. Verifying QR objects against a
 * live MinIO stays a manual/local step (`npm run db:verify:qr-assets`).
 */
import { randomUUID } from 'crypto';
import { join } from 'path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as schema from './schema';
import type { DrizzleDatabase } from './database.types';
import {
  EXPECTED_SEED_COUNTS,
  SeedStorageConfig,
  seedRequiredStatics,
} from './seeds/required-seeds';
import {
  EXPECTED_TABLE_NAMES,
  FORBIDDEN_TABLE_NAMES,
} from './data-layer.tables';

const TEST_URL = process.env.DATABASE_TEST_URL;
const describeIntegration = TEST_URL ? describe : describe.skip;

const MIGRATIONS_FOLDER = join(__dirname, 'migrations');

/** Storage config for seeding — composed from env with safe local fallbacks. */
const STORAGE: SeedStorageConfig = {
  storageProvider: 'minio',
  bucket: process.env.MINIO_BUCKET ?? 'svoya-igra',
  publicBaseUrl: process.env.MINIO_PUBLIC_URL ?? 'http://localhost:9000',
  pathStyle: (process.env.MINIO_PATH_STYLE ?? 'true') === 'true',
};

describeIntegration(
  'data layer integration (requires DATABASE_TEST_URL)',
  () => {
    let pool: Pool;
    let db: DrizzleDatabase;

    beforeAll(async () => {
      pool = new Pool({ connectionString: TEST_URL });
      db = drizzle(pool, { schema });
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
      // Seed once up front so topic-dependent constraint checks below do not
      // depend on test ordering. The idempotency test re-seeds and re-checks.
      await seedRequiredStatics(db, STORAGE);
    }, 60_000);

    afterAll(async () => {
      if (pool) await pool.end();
    });

    describe('migrations apply to an empty database', () => {
      it('creates exactly the 16 MVP tables (and no forbidden ones)', async () => {
        const { rows } = await pool.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
        );
        const present = new Set(rows.map((r) => r.table_name));
        // Drizzle's migration bookkeeping table is allowed alongside the 16.
        for (const name of EXPECTED_TABLE_NAMES) {
          expect(present.has(name)).toBe(true);
        }
        for (const forbidden of FORBIDDEN_TABLE_NAMES) {
          expect(present.has(forbidden)).toBe(false);
        }
        const appTables = [...present].filter(
          (t) => !t.startsWith('__drizzle'),
        );
        expect(appTables.sort()).toEqual([...EXPECTED_TABLE_NAMES].sort());
      });
    });

    describe('required static seeds', () => {
      it('seed idempotently and produce the expected counts', async () => {
        // Re-seed (on top of the beforeAll seed) to prove idempotency — stable
        // ids + upsert mean repeated runs converge without duplicating rows.
        await seedRequiredStatics(db, STORAGE);
        const counts = await seedRequiredStatics(db, STORAGE);
        expect(counts).toEqual(EXPECTED_SEED_COUNTS);
        expect(counts.categories).toBe(6);
        expect(counts.questions).toBe(30);
      });

      it('leave every runtime table empty', async () => {
        const runtimeTables = [
          'rooms',
          'players',
          'teams',
          'board_cells',
          'purchases',
          'inventory_items',
          'presentation_submissions',
          'evaluation_scores',
          'final_results',
        ];
        for (const table of runtimeTables) {
          const { rows } = await pool.query<{ count: string }>(
            `SELECT count(*)::int AS count FROM "${table}"`,
          );
          expect(Number(rows[0].count)).toBe(0);
        }
      });
    });

    describe('unique constraints are enforced', () => {
      const { rooms, teams, players, presentationTopics } = schema;

      /** A minimal valid room row (random code + host token). */
      const newRoom = () => ({
        code: `IT-${randomUUID().slice(0, 8)}`,
        hostReconnectToken: randomUUID(),
      });

      it('rejects a duplicate room code', async () => {
        const code = `IT-${randomUUID().slice(0, 8)}`;
        await expect(
          db.transaction(async (tx) => {
            await tx
              .insert(rooms)
              .values({ code, hostReconnectToken: randomUUID() });
            await tx
              .insert(rooms)
              .values({ code, hostReconnectToken: randomUUID() });
          }),
        ).rejects.toThrow();
      });

      it('rejects a duplicate player reconnect token', async () => {
        const token = randomUUID();
        await expect(
          db.transaction(async (tx) => {
            const [room] = await tx.insert(rooms).values(newRoom()).returning();
            await tx.insert(players).values({
              roomId: room.id,
              name: 'A',
              reconnectToken: token,
            });
            await tx.insert(players).values({
              roomId: room.id,
              name: 'B',
              reconnectToken: token,
            });
          }),
        ).rejects.toThrow();
      });

      it('rejects a duplicate player name within the same room', async () => {
        await expect(
          db.transaction(async (tx) => {
            const [room] = await tx.insert(rooms).values(newRoom()).returning();
            await tx.insert(players).values({
              roomId: room.id,
              name: 'Same',
              reconnectToken: randomUUID(),
            });
            await tx.insert(players).values({
              roomId: room.id,
              name: 'Same',
              reconnectToken: randomUUID(),
            });
          }),
        ).rejects.toThrow();
      });

      it('rejects two teams selecting the same topic in one room', async () => {
        await expect(
          db.transaction(async (tx) => {
            const [room] = await tx.insert(rooms).values(newRoom()).returning();
            const [topic] = await tx.select().from(presentationTopics).limit(1);
            await tx.insert(teams).values({
              roomId: room.id,
              name: 'Team A',
              selectedTopicId: topic.id,
            });
            await tx.insert(teams).values({
              roomId: room.id,
              name: 'Team B',
              selectedTopicId: topic.id,
            });
          }),
        ).rejects.toThrow();
      });

      it('allows multiple teams with no topic yet (NULLs coexist)', async () => {
        // This one is expected to SUCCEED up to the rollback — proving NULL
        // selectedTopicId does not trip the (roomId, selectedTopicId) unique.
        const ROLLBACK = Symbol('rollback');
        await expect(
          db.transaction(async (tx) => {
            const [room] = await tx.insert(rooms).values(newRoom()).returning();
            await tx.insert(teams).values({ roomId: room.id, name: 'Team A' });
            await tx.insert(teams).values({ roomId: room.id, name: 'Team B' });
            throw ROLLBACK; // never persist runtime rows
          }),
        ).rejects.toBe(ROLLBACK);
      });
    });

    describe('foreign keys are enforced', () => {
      const { questions, shopItems } = schema;

      it('rejects a question referencing a non-existent category', async () => {
        await expect(
          db.transaction(async (tx) => {
            await tx.insert(questions).values({
              categoryId: randomUUID(),
              text: 'orphan',
              correctAnswer: 'x',
              points: 100,
              position: 1,
            });
          }),
        ).rejects.toThrow();
      });

      it('rejects a shop item referencing a non-existent QR tool', async () => {
        await expect(
          db.transaction(async (tx) => {
            await tx.insert(shopItems).values({
              title: 'orphan',
              price: 100,
              qrToolId: randomUUID(),
            });
          }),
        ).rejects.toThrow();
      });
    });
  },
);

/**
 * Required static seed runner (Stage 5A.6).
 *
 * Inserts the MVP "tier 1" datasets (6 categories, 30 questions, presentation
 * topics, QR-tool metadata, shop items, presentation requirements, evaluation
 * criteria) in dependency order and verifies the resulting counts. It is part of
 * Infrastructure (which owns seed execution); it holds no feature behaviour and
 * is never imported by the application/domain layers.
 *
 * Idempotency: every row carries a stable id and is written with an upsert on the
 * primary key (`onConflictDoUpdate`), so re-running converges the database to the
 * seed definitions without creating duplicates — safe to run repeatedly and safe
 * alongside existing runtime data (catalog rows are updated in place, never
 * deleted, so foreign keys from runtime tables are preserved).
 *
 * Scope guardrails: this runner seeds ONLY static catalog tables. It never writes
 * runtime tables (rooms/players/teams/board_cells/purchases/inventory_items/
 * presentation_submissions/evaluation_scores/final_results) and never uploads QR
 * `.svg` bytes — it composes QR storage metadata from config only.
 */
import { getTableColumns, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import {
  buildPublicUrl,
  qrToolStorageKey,
} from '../../storage/storage-key.helper';
import type { DrizzleDatabase } from '../database.types';
import {
  categories,
  evaluationCriteria,
  presentationRequirements,
  presentationTopics,
  qrTools,
  questions,
  shopItems,
} from '../schema';
import {
  CATEGORY_SEEDS,
  EVALUATION_CRITERION_SEEDS,
  PRESENTATION_REQUIREMENT_SEEDS,
  PRESENTATION_TOPIC_SEEDS,
  QR_TOOL_SEEDS,
  QUESTION_SEEDS,
  SHOP_ITEM_SEEDS,
} from './required-seed-data';

/** Storage settings needed to compose QR-tool metadata (no upload performed). */
export interface SeedStorageConfig {
  storageProvider: string;
  bucket: string;
  publicBaseUrl: string;
  pathStyle: boolean;
}

/** Counts of rows present after seeding, surfaced for verification/reporting. */
export interface SeedCounts {
  categories: number;
  questions: number;
  presentationTopics: number;
  qrTools: number;
  shopItems: number;
  presentationRequirements: number;
  evaluationCriteria: number;
}

/** Expected required-seed counts (used for verification and reporting). */
export const EXPECTED_SEED_COUNTS: SeedCounts = {
  categories: CATEGORY_SEEDS.length,
  questions: QUESTION_SEEDS.length,
  presentationTopics: PRESENTATION_TOPIC_SEEDS.length,
  qrTools: QR_TOOL_SEEDS.length,
  shopItems: SHOP_ITEM_SEEDS.length,
  presentationRequirements: PRESENTATION_REQUIREMENT_SEEDS.length,
  evaluationCriteria: EVALUATION_CRITERION_SEEDS.length,
};

/**
 * Build the `onConflictDoUpdate` SET map for a table: every column except the
 * primary key and `createdAt` is refreshed from the row being inserted
 * (`excluded.*`), so re-seeding updates content in place while preserving the
 * original id and creation time.
 */
function refreshFromExcluded(table: PgTable): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (key === 'id' || key === 'createdAt') continue;
    set[key] = sql.raw(`excluded."${column.name}"`);
  }
  return set;
}

async function countRows(db: DrizzleDatabase, table: PgTable): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(table);
  return row?.value ?? 0;
}

/**
 * Run all required static seeds idempotently, then read back and verify the
 * resulting row counts. Rejects if any count does not match the expected value.
 * Returns the verified counts for reporting.
 */
export async function seedRequiredStatics(
  db: DrizzleDatabase,
  storage: SeedStorageConfig,
): Promise<SeedCounts> {
  // Reference/catalog tables first, then their dependents — the same order as
  // the migrations so foreign keys always resolve.
  await db
    .insert(categories)
    .values(CATEGORY_SEEDS)
    .onConflictDoUpdate({
      target: categories.id,
      set: refreshFromExcluded(categories),
    });

  await db
    .insert(questions)
    .values(QUESTION_SEEDS)
    .onConflictDoUpdate({
      target: questions.id,
      set: refreshFromExcluded(questions),
    });

  await db
    .insert(presentationTopics)
    .values(PRESENTATION_TOPIC_SEEDS)
    .onConflictDoUpdate({
      target: presentationTopics.id,
      set: refreshFromExcluded(presentationTopics),
    });

  // Compose QR metadata from config: provider/bucket/key/publicUrl. The
  // `storageKey` is the global `qr-tools/<id>.svg` convention (no roomId); the
  // `.svg` object itself is placed in MinIO in a later sub-stage (5A.7).
  const qrToolRows = QR_TOOL_SEEDS.map((tool) => {
    const storageKey = qrToolStorageKey(tool.id);
    return {
      id: tool.id,
      title: tool.title,
      description: tool.description,
      payload: tool.payload,
      fileFormat: 'svg',
      storageProvider: storage.storageProvider,
      bucket: storage.bucket,
      storageKey,
      publicUrl: buildPublicUrl({
        publicBaseUrl: storage.publicBaseUrl,
        bucket: storage.bucket,
        storageKey,
        pathStyle: storage.pathStyle,
      }),
    };
  });

  await db
    .insert(qrTools)
    .values(qrToolRows)
    .onConflictDoUpdate({
      target: qrTools.id,
      set: refreshFromExcluded(qrTools),
    });

  await db
    .insert(shopItems)
    .values(SHOP_ITEM_SEEDS)
    .onConflictDoUpdate({
      target: shopItems.id,
      set: refreshFromExcluded(shopItems),
    });

  await db
    .insert(presentationRequirements)
    .values(PRESENTATION_REQUIREMENT_SEEDS)
    .onConflictDoUpdate({
      target: presentationRequirements.id,
      set: refreshFromExcluded(presentationRequirements),
    });

  await db
    .insert(evaluationCriteria)
    .values(EVALUATION_CRITERION_SEEDS)
    .onConflictDoUpdate({
      target: evaluationCriteria.id,
      set: refreshFromExcluded(evaluationCriteria),
    });

  const counts: SeedCounts = {
    categories: await countRows(db, categories),
    questions: await countRows(db, questions),
    presentationTopics: await countRows(db, presentationTopics),
    qrTools: await countRows(db, qrTools),
    shopItems: await countRows(db, shopItems),
    presentationRequirements: await countRows(db, presentationRequirements),
    evaluationCriteria: await countRows(db, evaluationCriteria),
  };

  const mismatches = (
    Object.keys(EXPECTED_SEED_COUNTS) as (keyof SeedCounts)[]
  ).filter((key) => counts[key] !== EXPECTED_SEED_COUNTS[key]);

  if (mismatches.length > 0) {
    const detail = mismatches
      .map(
        (key) =>
          `  - ${key}: expected ${EXPECTED_SEED_COUNTS[key]}, found ${counts[key]}`,
      )
      .join('\n');
    throw new Error(`Seed verification failed — count mismatch:\n${detail}`);
  }

  return counts;
}

import { sql } from 'drizzle-orm';
import { DrizzleDatabase } from '../database.types';
import {
  categories,
  evaluationCriteria,
  presentationRequirements,
  presentationTopics,
  qrTools,
  questions,
  shopItems,
} from '../schema';
import { SeedData } from './seed-data.schema';

/**
 * Writes the validated catalogs into PostgreSQL. Idempotent by fixed UUID:
 * every table upserts on its primary key (`ON CONFLICT (id) DO UPDATE`), so a
 * second run updates the JSON-derived columns in place and never duplicates
 * rows. `created_at` is intentionally excluded from the update set so reruns
 * preserve the original timestamp.
 *
 * All writes run inside one transaction, ordered so foreign keys resolve:
 * categories → questions, qr_tools → shop_items (topics / requirements /
 * criteria are independent). Only the seven seeded catalogs are touched —
 * runtime tables (rooms, teams, board_cells, purchases, …) are never written.
 */

/** Per-QR-tool storage metadata computed by the CLI from the uploaded SVGs. */
export type QrStorageByToolId = Map<
  string,
  { bucket: string; storageKey: string; publicUrl: string }
>;

/** `excluded.<column>` reference for the upsert's DO UPDATE set. */
const excluded = (column: string) => sql`excluded.${sql.identifier(column)}`;

export async function seedCatalogs(
  db: DrizzleDatabase,
  data: SeedData,
  qrStorage: QrStorageByToolId,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(categories)
      .values(
        data.categories.map((row) => ({
          id: row.id,
          title: row.title,
          position: row.position,
        })),
      )
      .onConflictDoUpdate({
        target: categories.id,
        set: { title: excluded('title'), position: excluded('position') },
      });

    await tx
      .insert(questions)
      .values(
        data.questions.map((row) => ({
          id: row.id,
          categoryId: row.category_id,
          text: row.text,
          correctAnswer: row.correct_answer,
          points: row.points,
          position: row.position,
        })),
      )
      .onConflictDoUpdate({
        target: questions.id,
        set: {
          categoryId: excluded('category_id'),
          text: excluded('text'),
          correctAnswer: excluded('correct_answer'),
          points: excluded('points'),
          position: excluded('position'),
        },
      });

    await tx
      .insert(presentationTopics)
      .values(
        data.presentationTopics.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
        })),
      )
      .onConflictDoUpdate({
        target: presentationTopics.id,
        set: { title: excluded('title'), description: excluded('description') },
      });

    await tx
      .insert(qrTools)
      .values(
        data.qrTools.map((row) => {
          const storage = qrStorage.get(row.id);
          if (!storage) {
            throw new Error(`missing uploaded storage for qr_tool ${row.id}`);
          }
          return {
            id: row.id,
            title: row.title,
            description: row.description,
            payload: null,
            fileFormat: 'SVG' as const,
            storageProvider: 'minio',
            bucket: storage.bucket,
            storageKey: storage.storageKey,
            publicUrl: storage.publicUrl,
          };
        }),
      )
      .onConflictDoUpdate({
        target: qrTools.id,
        set: {
          title: excluded('title'),
          description: excluded('description'),
          payload: excluded('payload'),
          fileFormat: excluded('file_format'),
          storageProvider: excluded('storage_provider'),
          bucket: excluded('bucket'),
          storageKey: excluded('storage_key'),
          publicUrl: excluded('public_url'),
        },
      });

    await tx
      .insert(shopItems)
      .values(
        data.shopItems.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          price: row.price,
          qrToolId: row.qr_tool_id,
        })),
      )
      .onConflictDoUpdate({
        target: shopItems.id,
        set: {
          title: excluded('title'),
          description: excluded('description'),
          price: excluded('price'),
          qrToolId: excluded('qr_tool_id'),
        },
      });

    await tx
      .insert(presentationRequirements)
      .values(
        data.presentationRequirements.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          order: row.order,
          isRequired: row.is_required,
        })),
      )
      .onConflictDoUpdate({
        target: presentationRequirements.id,
        set: {
          title: excluded('title'),
          description: excluded('description'),
          order: excluded('order'),
          isRequired: excluded('is_required'),
        },
      });

    await tx
      .insert(evaluationCriteria)
      .values(
        data.evaluationCriteria.map((row) => ({
          id: row.id,
          title: row.title,
          description: row.description,
          minScore: row.min_score,
          maxScore: row.max_score,
          order: row.order,
        })),
      )
      .onConflictDoUpdate({
        target: evaluationCriteria.id,
        set: {
          title: excluded('title'),
          description: excluded('description'),
          minScore: excluded('min_score'),
          maxScore: excluded('max_score'),
          order: excluded('order'),
        },
      });
  });
}

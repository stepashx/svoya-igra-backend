import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  assertSeedRelations,
  SeedData,
  seedFileSchemas,
} from './seed-data.schema';

/**
 * Reads and validates the placeholder catalog JSON files (`./data/*.json`),
 * returning a fully-typed, relationally-consistent `SeedData`. All validation
 * happens here, before the seeder touches PostgreSQL — a malformed or
 * inconsistent file aborts with a clear, aggregated error instead of a silent
 * partial seed.
 *
 * Files are resolved relative to this module (`__dirname`), so the seed runs
 * the same way under ts-node and Jest. The application never reads these files
 * at runtime — only the seed CLI does.
 */
const DATA_DIR = resolve(__dirname, 'data');

const FILE_NAMES = {
  categories: 'categories.json',
  questions: 'questions.json',
  presentationTopics: 'presentation-topics.json',
  qrTools: 'qr-tools.json',
  shopItems: 'shop-items.json',
  presentationRequirements: 'presentation-requirements.json',
  evaluationCriteria: 'evaluation-criteria.json',
} as const;

function readJson(fileName: string): unknown {
  const path = resolve(DATA_DIR, fileName);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(
      `Cannot read seed file "${fileName}": ${(error as Error).message}`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Seed file "${fileName}" is not valid JSON: ${(error as Error).message}`,
    );
  }
}

function parseFile<S extends z.ZodTypeAny>(
  fileName: string,
  schema: S,
): z.infer<S> {
  const result = schema.safeParse(readJson(fileName));
  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue) => `  - [${issue.path.join('.') || 'root'}] ${issue.message}`,
      )
      .join('\n');
    throw new Error(`Seed file "${fileName}" failed validation:\n${issues}`);
  }
  return result.data;
}

/** Read + structurally + relationally validate every catalog file. */
export function loadSeedData(): SeedData {
  const data: SeedData = {
    categories: parseFile(FILE_NAMES.categories, seedFileSchemas.categories),
    questions: parseFile(FILE_NAMES.questions, seedFileSchemas.questions),
    presentationTopics: parseFile(
      FILE_NAMES.presentationTopics,
      seedFileSchemas.presentationTopics,
    ),
    qrTools: parseFile(FILE_NAMES.qrTools, seedFileSchemas.qrTools),
    shopItems: parseFile(FILE_NAMES.shopItems, seedFileSchemas.shopItems),
    presentationRequirements: parseFile(
      FILE_NAMES.presentationRequirements,
      seedFileSchemas.presentationRequirements,
    ),
    evaluationCriteria: parseFile(
      FILE_NAMES.evaluationCriteria,
      seedFileSchemas.evaluationCriteria,
    ),
  };
  assertSeedRelations(data);
  return data;
}

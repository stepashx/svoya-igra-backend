import { z } from 'zod';

/**
 * Validation contract for the placeholder catalog JSON files (Stage 4.2). Pure,
 * no I/O — the loader reads the files and runs these checks before any write.
 *
 * Two layers:
 *  1. zod item/file schemas pin each object's shape and the fixed counts the
 *     plan mandates (§19): exactly 6 categories, 30 questions, 2 criteria;
 *     topics / QR-tools / shop-items / requirements stay variable-length but
 *     non-empty.
 *  2. `assertSeedRelations` checks the cross-file invariants zod cannot express:
 *     fixed-UUID uniqueness, the 6×5 board layout with the canonical price tiers,
 *     and the 1:1 shop-item ↔ QR-tool pairing with no orphans.
 *
 * Field names mirror the DB columns (snake_case); the seeder maps them to the
 * Drizzle camelCase keys at insert time.
 */

/** Canonical question price tiers, one per cell column — plan §14.4. */
export const QUESTION_POINTS = [100, 200, 400, 600, 800] as const;
/** Board layout fixed by the plan (§14.4 / §19). */
export const CATEGORY_COUNT = 6;
export const QUESTIONS_PER_CATEGORY = QUESTION_POINTS.length; // 5
export const QUESTION_COUNT = CATEGORY_COUNT * QUESTIONS_PER_CATEGORY; // 30
/** Topics must cover the max number of teams (3) plus slack — plan §14.3. */
export const MIN_TOPICS = 3;
/** MVP evaluation criteria: exactly two, 0–10 each — plan §6 / §12. */
export const EVALUATION_CRITERIA_COUNT = 2;
export const EVALUATION_CRITERIA_TITLES = [
  'Раскрытие темы',
  'Дизайн презентации',
] as const;

const uuid = z.string().uuid();
const nonEmpty = z.string().min(1);
// Nullable catalog description: a string, explicit null, or omitted → null.
const description = z.union([z.string().min(1), z.null()]).default(null);
const points = z
  .number()
  .int()
  .refine(
    (value): value is (typeof QUESTION_POINTS)[number] =>
      (QUESTION_POINTS as readonly number[]).includes(value),
    { message: `points must be one of ${QUESTION_POINTS.join(', ')}` },
  );

export const categorySchema = z
  .object({
    id: uuid,
    title: nonEmpty,
    position: z.number().int().nonnegative(),
  })
  .strict();

export const questionSchema = z
  .object({
    id: uuid,
    category_id: uuid,
    text: nonEmpty,
    correct_answer: nonEmpty,
    points,
    position: z
      .number()
      .int()
      .min(0)
      .max(QUESTIONS_PER_CATEGORY - 1),
  })
  .strict();

export const presentationTopicSchema = z
  .object({ id: uuid, title: nonEmpty, description })
  .strict();

export const qrToolSchema = z
  .object({ id: uuid, title: nonEmpty, description })
  .strict();

export const shopItemSchema = z
  .object({
    id: uuid,
    title: nonEmpty,
    description,
    price: z.number().int().nonnegative(),
    qr_tool_id: uuid,
  })
  .strict();

export const presentationRequirementSchema = z
  .object({
    id: uuid,
    title: nonEmpty,
    description,
    order: z.number().int().nonnegative(),
    is_required: z.boolean(),
  })
  .strict();

export const evaluationCriterionSchema = z
  .object({
    id: uuid,
    title: nonEmpty,
    description,
    min_score: z.number().int().nonnegative(),
    max_score: z.number().int(),
    order: z.number().int().nonnegative(),
  })
  .strict()
  .refine((c) => c.max_score > c.min_score, {
    message: 'max_score must be greater than min_score',
  });

/** Per-file schemas with the plan-mandated lengths. */
export const seedFileSchemas = {
  categories: z.array(categorySchema).length(CATEGORY_COUNT),
  questions: z.array(questionSchema).length(QUESTION_COUNT),
  presentationTopics: z.array(presentationTopicSchema).min(MIN_TOPICS),
  qrTools: z.array(qrToolSchema).min(1),
  shopItems: z.array(shopItemSchema).min(1),
  presentationRequirements: z.array(presentationRequirementSchema).min(1),
  evaluationCriteria: z
    .array(evaluationCriterionSchema)
    .length(EVALUATION_CRITERIA_COUNT),
} as const;

export type Category = z.infer<typeof categorySchema>;
export type Question = z.infer<typeof questionSchema>;
export type PresentationTopic = z.infer<typeof presentationTopicSchema>;
export type QrTool = z.infer<typeof qrToolSchema>;
export type ShopItem = z.infer<typeof shopItemSchema>;
export type PresentationRequirement = z.infer<
  typeof presentationRequirementSchema
>;
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;

/** The full, validated catalog set the seeder writes. */
export interface SeedData {
  categories: Category[];
  questions: Question[];
  presentationTopics: PresentationTopic[];
  qrTools: QrTool[];
  shopItems: ShopItem[];
  presentationRequirements: PresentationRequirement[];
  evaluationCriteria: EvaluationCriterion[];
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }
  return [...duplicates];
}

function sameNumberSet(actual: number[], expected: readonly number[]): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  const a = [...actual].sort((x, y) => x - y);
  const b = [...expected].sort((x, y) => x - y);
  return a.every((value, index) => value === b[index]);
}

/**
 * Cross-file invariants zod cannot express. Throws a single aggregated error
 * listing every violation so a broken catalog fails loudly, never silently.
 */
export function assertSeedRelations(data: SeedData): void {
  const issues: string[] = [];

  const allIds = [
    ...data.categories,
    ...data.questions,
    ...data.presentationTopics,
    ...data.qrTools,
    ...data.shopItems,
    ...data.presentationRequirements,
    ...data.evaluationCriteria,
  ].map((row) => row.id);
  const duplicateIds = findDuplicates(allIds);
  if (duplicateIds.length > 0) {
    issues.push(`duplicate id(s) across catalogs: ${duplicateIds.join(', ')}`);
  }

  // Board layout: every question points at a real category, and each category
  // holds exactly the 5 canonical price tiers across positions 0..4.
  const categoryIds = new Set(data.categories.map((category) => category.id));
  for (const question of data.questions) {
    if (!categoryIds.has(question.category_id)) {
      issues.push(
        `question ${question.id} references unknown category_id ${question.category_id}`,
      );
    }
  }
  for (const category of data.categories) {
    const own = data.questions.filter((q) => q.category_id === category.id);
    if (own.length !== QUESTIONS_PER_CATEGORY) {
      issues.push(
        `category ${category.id} has ${own.length} question(s), expected ${QUESTIONS_PER_CATEGORY}`,
      );
      continue;
    }
    if (
      !sameNumberSet(
        own.map((q) => q.points),
        QUESTION_POINTS,
      )
    ) {
      issues.push(
        `category ${category.id} price tiers must be exactly ${QUESTION_POINTS.join(', ')}`,
      );
    }
    const positions = own.map((q) => q.position);
    if (!sameNumberSet(positions, [0, 1, 2, 3, 4])) {
      issues.push(
        `category ${category.id} question positions must be exactly 0..${QUESTIONS_PER_CATEGORY - 1}`,
      );
    }
  }

  // Shop ↔ QR tool: strict 1:1 bijection, no orphans on either side.
  const qrToolIds = new Set(data.qrTools.map((tool) => tool.id));
  for (const item of data.shopItems) {
    if (!qrToolIds.has(item.qr_tool_id)) {
      issues.push(
        `shop item ${item.id} references unknown qr_tool_id ${item.qr_tool_id}`,
      );
    }
  }
  const referencedQrToolIds = data.shopItems.map((item) => item.qr_tool_id);
  const duplicateRefs = findDuplicates(referencedQrToolIds);
  if (duplicateRefs.length > 0) {
    issues.push(
      `qr_tool_id(s) referenced by more than one shop item: ${duplicateRefs.join(', ')}`,
    );
  }
  const referenced = new Set(referencedQrToolIds);
  for (const tool of data.qrTools) {
    if (!referenced.has(tool.id)) {
      issues.push(`qr_tool ${tool.id} has no shop item (orphan)`);
    }
  }
  if (data.shopItems.length !== data.qrTools.length) {
    issues.push(
      `shop items (${data.shopItems.length}) and qr tools (${data.qrTools.length}) are not 1:1`,
    );
  }

  // Evaluation criteria: the two plan-mandated titles must be present.
  const criterionTitles = data.evaluationCriteria.map((c) => c.title);
  for (const required of EVALUATION_CRITERIA_TITLES) {
    if (!criterionTitles.includes(required)) {
      issues.push(`missing evaluation criterion "${required}"`);
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Seed data relational validation failed:\n - ${issues.join('\n - ')}`,
    );
  }
}

import { z } from 'zod';
import { loadSeedData } from './seed-data.loader';
import {
  assertSeedRelations,
  categorySchema,
  EVALUATION_CRITERIA_TITLES,
  QUESTION_POINTS,
  questionSchema,
  SeedData,
  seedFileSchemas,
  shopItemSchema,
} from './seed-data.schema';

const isUuid = (value: string) => z.string().uuid().safeParse(value).success;
const clone = (data: SeedData): SeedData =>
  JSON.parse(JSON.stringify(data)) as SeedData;

describe('seed catalog JSON', () => {
  const data = loadSeedData();

  it('loads and validates the real catalog files without throwing', () => {
    expect(() => loadSeedData()).not.toThrow();
  });

  it('every catalog id is a unique, well-formed UUID', () => {
    const ids = [
      ...data.categories,
      ...data.questions,
      ...data.presentationTopics,
      ...data.qrTools,
      ...data.shopItems,
      ...data.presentationRequirements,
      ...data.evaluationCriteria,
    ].map((row) => row.id);

    expect(ids.every(isUuid)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has exactly 6 categories with unique positions 0..5', () => {
    expect(data.categories).toHaveLength(6);
    const positions = data.categories
      .map((c) => c.position)
      .sort((a, b) => a - b);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('has exactly 30 questions: 5 per category with the canonical price tiers and positions 0..4', () => {
    expect(data.questions).toHaveLength(30);
    for (const category of data.categories) {
      const own = data.questions.filter((q) => q.category_id === category.id);
      expect(own).toHaveLength(5);
      expect(own.map((q) => q.points).sort((a, b) => a - b)).toEqual(
        [...QUESTION_POINTS].sort((a, b) => a - b),
      );
      expect(own.map((q) => q.position).sort((a, b) => a - b)).toEqual([
        0, 1, 2, 3, 4,
      ]);
    }
  });

  it('has at least 3 presentation topics', () => {
    expect(data.presentationTopics.length).toBeGreaterThanOrEqual(3);
  });

  it('pairs shop items and QR tools 1:1 with no orphans', () => {
    expect(data.shopItems).toHaveLength(data.qrTools.length);
    const qrToolIds = new Set(data.qrTools.map((t) => t.id));
    const referenced = data.shopItems.map((s) => s.qr_tool_id);
    // every reference resolves, references are unique, every tool is referenced
    expect(referenced.every((id) => qrToolIds.has(id))).toBe(true);
    expect(new Set(referenced).size).toBe(referenced.length);
    expect(new Set(referenced).size).toBe(qrToolIds.size);
  });

  it('has exactly the two MVP evaluation criteria, each scored 0..10', () => {
    expect(data.evaluationCriteria).toHaveLength(2);
    expect(data.evaluationCriteria.map((c) => c.title).sort()).toEqual(
      [...EVALUATION_CRITERIA_TITLES].sort(),
    );
    for (const criterion of data.evaluationCriteria) {
      expect(criterion.min_score).toBe(0);
      expect(criterion.max_score).toBe(10);
    }
  });

  it('has 4 presentation requirements with ordered positions', () => {
    expect(data.presentationRequirements).toHaveLength(4);
    expect(
      data.presentationRequirements.map((r) => r.order).sort((a, b) => a - b),
    ).toEqual([0, 1, 2, 3]);
  });
});

describe('seed file schemas (structure)', () => {
  const data = loadSeedData();

  it('rejects a categories array of the wrong length', () => {
    expect(
      seedFileSchemas.categories.safeParse(data.categories.slice(1)).success,
    ).toBe(false);
  });

  it('rejects an evaluation-criteria array that is not exactly two', () => {
    expect(
      seedFileSchemas.evaluationCriteria.safeParse(
        data.evaluationCriteria.slice(1),
      ).success,
    ).toBe(false);
  });

  it('rejects a question with an off-grid points value', () => {
    expect(
      questionSchema.safeParse({ ...data.questions[0], points: 300 }).success,
    ).toBe(false);
  });

  it('rejects an object with unknown keys (strict)', () => {
    expect(
      categorySchema.safeParse({ ...data.categories[0], surprise: true })
        .success,
    ).toBe(false);
  });

  it('rejects a shop item with a zero price (must be strictly positive)', () => {
    // A free item would be unbuyable (Team.debitBalance rejects price <= 0).
    expect(
      shopItemSchema.safeParse({ ...data.shopItems[0], price: 0 }).success,
    ).toBe(false);
    expect(
      shopItemSchema.safeParse({ ...data.shopItems[0], price: 100 }).success,
    ).toBe(true);
  });
});

describe('assertSeedRelations (cross-file invariants)', () => {
  const base = loadSeedData();

  it('passes for the real, consistent data', () => {
    expect(() => assertSeedRelations(base)).not.toThrow();
  });

  it('throws when a question references an unknown category', () => {
    const broken = clone(base);
    broken.questions[0].category_id = '00000000-0000-4000-8000-0000000000ff';
    expect(() => assertSeedRelations(broken)).toThrow(/unknown category_id/);
  });

  it('throws when a category does not have exactly five questions', () => {
    const broken = clone(base);
    broken.questions.pop();
    expect(() => assertSeedRelations(broken)).toThrow(/expected 5/);
  });

  it('throws when a shop item references an unknown QR tool', () => {
    const broken = clone(base);
    broken.shopItems[0].qr_tool_id = '00000000-0000-4000-8000-0000000000ff';
    expect(() => assertSeedRelations(broken)).toThrow(/unknown qr_tool_id/);
  });

  it('throws when two shop items share one QR tool (breaks 1:1)', () => {
    const broken = clone(base);
    broken.shopItems[1].qr_tool_id = broken.shopItems[0].qr_tool_id;
    expect(() => assertSeedRelations(broken)).toThrow(
      /referenced by more than one shop item|orphan/,
    );
  });

  it('throws when an id is duplicated across catalogs', () => {
    const broken = clone(base);
    broken.questions[1].id = broken.questions[0].id;
    expect(() => assertSeedRelations(broken)).toThrow(/duplicate id/);
  });

  it('throws when a mandated evaluation criterion title is missing', () => {
    const broken = clone(base);
    broken.evaluationCriteria[0].title = 'Что-то другое';
    expect(() => assertSeedRelations(broken)).toThrow(/missing evaluation/);
  });
});

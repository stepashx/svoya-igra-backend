/**
 * Lightweight, DB-free verification of the required static seed datasets
 * (Stage 5A.6). These assert the structural invariants the planning docs fix —
 * correct counts, the five-per-category board shape with the right point values,
 * valid cross-references, and the two evaluation criteria — so a malformed seed
 * dataset fails in `npm test` long before it ever touches a database. The DB-side
 * count verification is enforced separately by the seed runner itself.
 */
import {
  CATEGORY_IDS,
  CATEGORY_SEEDS,
  EVALUATION_CRITERION_SEEDS,
  PRESENTATION_REQUIREMENT_SEEDS,
  PRESENTATION_TOPIC_SEEDS,
  QR_TOOL_SEEDS,
  QUESTION_POINT_VALUES,
  QUESTION_SEEDS,
  SHOP_ITEM_SEEDS,
} from './required-seed-data';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('required static seed data', () => {
  it('has globally unique, valid UUID ids across every dataset', () => {
    const ids = [
      ...CATEGORY_SEEDS,
      ...QUESTION_SEEDS,
      ...PRESENTATION_TOPIC_SEEDS,
      ...QR_TOOL_SEEDS,
      ...SHOP_ITEM_SEEDS,
      ...PRESENTATION_REQUIREMENT_SEEDS,
      ...EVALUATION_CRITERION_SEEDS,
    ].map((row) => row.id as string);

    for (const id of ids) {
      expect(id).toMatch(UUID_RE);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('categories', () => {
    it('contains exactly 6 categories with unique positions 1..6', () => {
      expect(CATEGORY_SEEDS).toHaveLength(6);
      const positions = CATEGORY_SEEDS.map((c) => c.position).sort(
        (a, b) => a - b,
      );
      expect(positions).toEqual([1, 2, 3, 4, 5, 6]);
      for (const category of CATEGORY_SEEDS) {
        expect(category.title.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('questions', () => {
    it('contains exactly 30 questions, all mapped to seeded categories', () => {
      expect(QUESTION_SEEDS).toHaveLength(30);
      const categoryIds = new Set<string>(Object.values(CATEGORY_IDS));
      for (const question of QUESTION_SEEDS) {
        expect(categoryIds.has(question.categoryId)).toBe(true);
      }
    });

    it('has five questions per category, one at each point value', () => {
      for (const categoryId of Object.values(CATEGORY_IDS)) {
        const inCategory = QUESTION_SEEDS.filter(
          (q) => q.categoryId === categoryId,
        );
        expect(inCategory).toHaveLength(5);
        const points = inCategory.map((q) => q.points).sort((a, b) => a - b);
        expect(points).toEqual([...QUESTION_POINT_VALUES]);
        const positions = inCategory
          .map((q) => q.position)
          .sort((a, b) => a - b);
        expect(positions).toEqual([1, 2, 3, 4, 5]);
      }
    });

    it('uses only the allowed point values', () => {
      const allowed = new Set<number>(QUESTION_POINT_VALUES);
      for (const question of QUESTION_SEEDS) {
        expect(allowed.has(question.points)).toBe(true);
      }
    });

    it('gives every question non-empty text and a backend-only correct answer', () => {
      for (const question of QUESTION_SEEDS) {
        expect(question.text.trim().length).toBeGreaterThan(0);
        expect(question.correctAnswer.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('presentation topics', () => {
    it('provides at least the max supported team count (3), with non-empty titles', () => {
      expect(PRESENTATION_TOPIC_SEEDS.length).toBeGreaterThanOrEqual(3);
      for (const topic of PRESENTATION_TOPIC_SEEDS) {
        expect(topic.title.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('shop items and QR tools', () => {
    it('every shop item has a positive price and references a seeded QR tool', () => {
      const qrToolIds = new Set(QR_TOOL_SEEDS.map((t) => t.id));
      for (const item of SHOP_ITEM_SEEDS) {
        expect(item.price).toBeGreaterThan(0);
        expect(qrToolIds.has(item.qrToolId)).toBe(true);
      }
    });
  });

  describe('presentation requirements', () => {
    it('has unique ordering and non-empty titles', () => {
      expect(PRESENTATION_REQUIREMENT_SEEDS.length).toBeGreaterThan(0);
      const orders = PRESENTATION_REQUIREMENT_SEEDS.map((r) => r.order);
      expect(new Set(orders).size).toBe(orders.length);
      for (const requirement of PRESENTATION_REQUIREMENT_SEEDS) {
        expect(requirement.title.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('evaluation criteria', () => {
    it('defines exactly the two MVP dimensions on a 0..10 range', () => {
      expect(EVALUATION_CRITERION_SEEDS).toHaveLength(2);
      const orders = EVALUATION_CRITERION_SEEDS.map((c) => c.order).sort(
        (a, b) => a - b,
      );
      expect(orders).toEqual([1, 2]);
      for (const criterion of EVALUATION_CRITERION_SEEDS) {
        expect(criterion.minScore).toBe(0);
        expect(criterion.maxScore).toBe(10);
      }
    });
  });
});

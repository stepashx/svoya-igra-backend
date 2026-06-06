/**
 * Canonical data-layer table inventory (Stage 5A.8).
 *
 * The single, authoritative list of the 16 MVP tables (and the tables the master
 * context forbids), shared by the data-layer verification tests so the expected
 * inventory is defined once and cannot drift between the DB-free structure check
 * and the gated integration check. These are the physical (snake_case) names.
 */

/** The 16 MVP tables, by physical name. */
export const EXPECTED_TABLE_NAMES = [
  'rooms',
  'players',
  'teams',
  'presentation_topics',
  'categories',
  'questions',
  'board_cells',
  'qr_tools',
  'shop_items',
  'purchases',
  'inventory_items',
  'presentation_requirements',
  'presentation_submissions',
  'evaluation_criteria',
  'evaluation_scores',
  'final_results',
] as const;

/** Tables the master context explicitly forbids in the MVP. */
export const FORBIDDEN_TABLE_NAMES = ['hosts', 'files'] as const;

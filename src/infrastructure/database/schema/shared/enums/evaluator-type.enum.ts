/**
 * Who produced an evaluation of a presentation. Lets the Evaluation feature
 * distinguish authoritative host scoring from jury input without separate
 * tables.
 *
 * Constrained text column + derived union (see {@link RoomStatus}).
 *
 * - `host` — the room host / facilitator (weight 2).
 * - `team` — an evaluating team (weight 1).
 */
export const EVALUATOR_TYPES = ['host', 'team'] as const;

export type EvaluatorType = (typeof EVALUATOR_TYPES)[number];

/**
 * Who produced an evaluation of a presentation. Lets the Evaluation feature
 * distinguish authoritative host scoring from jury input without separate
 * tables.
 *
 * Constrained text column + derived union (see {@link RoomStatus}).
 *
 * - `host` — the room host / facilitator.
 * - `jury` — a designated jury participant.
 */
export const EVALUATOR_TYPES = ['host', 'jury'] as const;

export type EvaluatorType = (typeof EVALUATOR_TYPES)[number];

/**
 * Board cell lifecycle state (plan §12), declared as the domain's OWN union
 * literal.
 *
 * The domain never imports the Drizzle schema (`_shared/enums.ts`) — keeping it
 * free of infrastructure. Conformance with the persistence column is enforced at
 * compile time by the board-cell mapper: a schema-union value is assigned to this
 * domain union (on read) and back (on write); the assignment only type-checks
 * while the two unions stay identical, so any drift breaks the build.
 *
 * A cell starts AVAILABLE, is SELECTED by the active team, then OPENED when its
 * question is revealed, and finally BLOCKED once the answer is reviewed (the
 * combat transitions are driven from later sub-stages; 6.1 only models them).
 */
export type BoardCellState = 'AVAILABLE' | 'SELECTED' | 'OPENED' | 'BLOCKED';

/**
 * Who produced an evaluation score (plan §12), declared as the domain's OWN
 * union literal: a TEAM (a captain's vote, weight 1) or the HOST (weight 2).
 *
 * The domain never imports the Drizzle schema (`_shared/enums.ts`) — keeping it
 * free of infrastructure, exactly like {@link SubmissionStatus}. Conformance
 * with the persistence column is enforced at compile time by the score mapper: a
 * schema-union value is assigned to this domain union (on read) and back (on
 * write); the assignment only type-checks while the two unions stay identical,
 * so any drift breaks the build.
 */
export type EvaluatorType = 'TEAM' | 'HOST';

/**
 * Presentation submission status (plan §12), declared as the domain's OWN union
 * literal. Create-on-upload: a row exists only after a file is uploaded, so the
 * status is UPLOADED (before the deadline) or LATE (after it).
 *
 * The domain never imports the Drizzle schema (`_shared/enums.ts`) — keeping it
 * free of infrastructure. Conformance with the persistence column is enforced at
 * compile time by the submission mapper: a schema-union value is assigned to this
 * domain union (on read) and back (on write); the assignment only type-checks
 * while the two unions stay identical, so any drift breaks the build.
 */
export type SubmissionStatus = 'UPLOADED' | 'LATE';

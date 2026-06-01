/**
 * Presentation schema — placeholder (Stage 5A.1).
 *
 * Tables (presentation topics, presentation requirements, presentation
 * submissions) are NOT defined yet. Decisions to honour when they do:
 *   - `presentation_topics` is a global catalog — no `assignedTeamId`.
 *   - Upload metadata lives on `presentation_submissions`. PostgreSQL stores
 *     metadata only; MinIO stores the bytes — there is no `files` table.
 *
 * File-format and submission-status vocabulary lives in `../shared/enums`;
 * reuse it, do not redeclare.
 */
export {};

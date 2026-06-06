/**
 * Presentation schema group (Stage 5A.4).
 *
 * The presentation-stage tables: the seeded `presentation_requirements` catalog
 * and the per-team `presentation_submissions` upload metadata. This file defines
 * the physical Drizzle tables, their constraints/indexes, and the Drizzle
 * query-API relations only. No presentation behaviour (upload, MinIO transfer,
 * late-penalty calculation, defense ordering, …) lives here — those are later
 * feature stages.
 *
 * Binding data decisions honoured here (see master context §8/§10 / Stage 5A
 * plan §7/§14):
 *   - `presentation_requirements` is a required/static seeded catalog.
 *   - `presentation_submissions` is the single source of truth for upload
 *     metadata. PostgreSQL stores ONLY file metadata; MinIO stores the bytes —
 *     there is NO separate `files` table.
 *   - One active submission per team per room via `(roomId, teamId)`; replacement
 *     until defense starts updates the same row (latest wins), so no version
 *     history exists in MVP.
 *   - NO `teams.presentationSubmissionId` back-reference (it lives in
 *     game-session and is intentionally omitted there).
 *
 * Status/format vocabulary (file format, presentation submission status) is
 * defined once in `../shared/enums` and reused here, never redeclared.
 */
import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  FILE_FORMATS,
  PRESENTATION_SUBMISSION_STATUSES,
  primaryId,
  timestamps,
} from '../shared';
import { players, rooms, teams } from '../game-session';

/**
 * A requirement shown to teams during presentation preparation. Global, static,
 * seeded reference content with a fixed display `order`; not room-scoped.
 */
export const presentationRequirements = pgTable(
  'presentation_requirements',
  {
    id: primaryId(),
    title: text('title').notNull(),
    description: text('description'),
    order: integer('order').notNull(),
    isRequired: boolean('is_required').notNull().default(true),
  },
  (table) => [
    // Requirement ordering is an identity within the catalog.
    unique('presentation_requirements_order_unique').on(table.order),
  ],
);

/**
 * Metadata for a team's uploaded presentation file; the bytes live in MinIO.
 *
 * The file-describing columns (`originalFileName`, `fileFormat`, `mimeType`,
 * `fileSize`, `storageProvider`, `bucket`, `storageKey`, `publicUrl`,
 * `uploadedAt`) are nullable so the schema supports both the `pending`
 * placeholder state and a completed upload without forcing a draft/non-draft
 * split. Upload logic (a later stage) populates them when a file is stored; this
 * stage adds schema support only.
 *
 * `fileFormat` reuses the shared FILE_FORMATS vocabulary; `mimeType` keeps the
 * exact stored MIME type (master context §10). `latePenalty` is numeric/decimal
 * so a later fractional penalty needs no type-changing migration.
 */
export const presentationSubmissions = pgTable(
  'presentation_submissions',
  {
    id: primaryId(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id),
    uploadedByPlayerId: uuid('uploaded_by_player_id').references(
      () => players.id,
    ),
    originalFileName: text('original_file_name'),
    fileFormat: text('file_format', { enum: FILE_FORMATS }),
    mimeType: text('mime_type'),
    fileSize: integer('file_size'),
    storageProvider: text('storage_provider'),
    bucket: text('bucket'),
    storageKey: text('storage_key'),
    publicUrl: text('public_url'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    isLate: boolean('is_late').notNull().default(false),
    latePenalty: numeric('late_penalty', { precision: 10, scale: 2 }),
    status: text('status', { enum: PRESENTATION_SUBMISSION_STATUSES })
      .notNull()
      .default('pending'),
    ...timestamps,
  },
  (table) => [
    // One active submission per team per room (replacement updates this row).
    unique('presentation_submissions_room_id_team_id_unique').on(
      table.roomId,
      table.teamId,
    ),
    // Room-scoped reads are the common lookup path.
    index('presentation_submissions_room_id_idx').on(table.roomId),
  ],
);

export const presentationRequirementsRelations = relations(
  presentationRequirements,
  () => ({}),
);

/**
 * Relations for the Drizzle query API. Only the FK-holding side is declared so
 * the accepted game-session relations stay untouched.
 */
export const presentationSubmissionsRelations = relations(
  presentationSubmissions,
  ({ one }) => ({
    room: one(rooms, {
      fields: [presentationSubmissions.roomId],
      references: [rooms.id],
    }),
    team: one(teams, {
      fields: [presentationSubmissions.teamId],
      references: [teams.id],
    }),
    uploadedBy: one(players, {
      fields: [presentationSubmissions.uploadedByPlayerId],
      references: [players.id],
    }),
  }),
);

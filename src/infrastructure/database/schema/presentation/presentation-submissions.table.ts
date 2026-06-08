import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, idPk, tsTz } from '../_shared/columns';
import { SUBMISSION_STATUSES } from '../_shared/enums';
import { players } from '../game-session/players.table';
import { rooms } from '../game-session/rooms.table';
import { teams } from '../game-session/teams.table';

/**
 * An uploaded presentation file (plan §12), create-on-upload: a row exists only
 * once a file is uploaded, so the file-location fields are all NOT NULL and the
 * stored SVG/PDF in MinIO is described by `storage_key` / `public_url`.
 * `storage_provider` defaults to `'minio'` (set in code/seeds), not an enum.
 *
 * One submission per team per room (`presentation_submissions_room_id_team_id_uq`);
 * a replacement updates the existing row. `is_late` and `late_penalty` are set
 * by the upload use case from the deadline comparison — `late_penalty` carries
 * no DB default so the §25 penalty value is never hard-coded here.
 *
 * `uploaded_by_player_id` records who uploaded; it is an actor reference, so
 * `set null` + nullable (consistent with the board's actor columns). See the
 * open questions in the task report — §12's onDelete is unspecified for it.
 */
export const presentationSubmissions = pgTable(
  'presentation_submissions',
  {
    id: idPk(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    uploadedByPlayerId: uuid('uploaded_by_player_id').references(
      () => players.id,
      { onDelete: 'set null' },
    ),
    originalFileName: text('original_file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    storageProvider: text('storage_provider').notNull().default('minio'),
    bucket: text('bucket').notNull(),
    storageKey: text('storage_key').notNull(),
    publicUrl: text('public_url').notNull(),
    uploadedAt: createdAt('uploaded_at'),
    deadlineAt: tsTz('deadline_at').notNull(),
    isLate: boolean('is_late').notNull().default(false),
    latePenalty: doublePrecision('late_penalty').notNull(),
    status: text('status', { enum: SUBMISSION_STATUSES }).notNull(),
  },
  (table) => [
    uniqueIndex('presentation_submissions_room_id_team_id_uq').on(
      table.roomId,
      table.teamId,
    ),
  ],
);

import { pgTable, text } from 'drizzle-orm/pg-core';
import { idPk } from '../_shared/columns';

/**
 * A presentation topic (plan §12). Authorized deviation from the letter of
 * §12: topics are a GLOBAL, reusable seed catalog — no `assignedTeamId` /
 * `roomId` here. Per-room selection lives on `teams.selected_topic_id` (unique
 * within a room). No `created_at`: §12 defines none for this catalog entity.
 */
export const presentationTopics = pgTable('presentation_topics', {
  id: idPk(),
  title: text('title').notNull(),
  description: text('description'),
});

import { presentationTopics } from '../../../../infrastructure/database/schema';
import { Topic } from '../../../domain/entities';

type TopicRow = typeof presentationTopics.$inferSelect;

/**
 * Row → entity. Topics are read-only (a seed-managed catalog), so there is no
 * insert/update mapper. The nullable `description` passes through unchanged.
 */
export function mapRowToTopic(row: TopicRow): Topic {
  return Topic.reconstitute({
    id: row.id,
    title: row.title,
    description: row.description,
  });
}

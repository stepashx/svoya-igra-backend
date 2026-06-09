import { presentationTopics } from '../../../../infrastructure/database/schema';
import { mapRowToTopic } from './topic.mapper';

describe('topic.mapper', () => {
  it('maps a row to a read-only topic entity', () => {
    const row: typeof presentationTopics.$inferSelect = {
      id: 'topic-1',
      title: 'AI Ethics',
      description: 'A description',
    };
    const topic = mapRowToTopic(row);
    expect(topic.id).toBe('topic-1');
    expect(topic.title).toBe('AI Ethics');
    expect(topic.description).toBe('A description');
  });

  it('passes through a null description', () => {
    const row: typeof presentationTopics.$inferSelect = {
      id: 'topic-2',
      title: 'No description',
      description: null,
    };
    expect(mapRowToTopic(row).description).toBeNull();
  });
});

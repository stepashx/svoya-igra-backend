import { Topic } from '../../domain/entities';
import { RoomTopicAvailability } from '../../application/queries';
import { RoomTopicResponseDto, TopicResponseDto } from '../dto/response';

/** Topic entity → response DTO. */
export function toTopicResponse(topic: Topic): TopicResponseDto {
  return { id: topic.id, title: topic.title, description: topic.description };
}

/** Topic + in-room availability → response DTO. */
export function toRoomTopicResponse(
  availability: RoomTopicAvailability,
): RoomTopicResponseDto {
  return {
    topic: toTopicResponse(availability.topic),
    takenByTeamId: availability.takenByTeamId,
  };
}

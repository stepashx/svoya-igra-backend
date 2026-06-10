import { Question } from '../../../gameplay/domain/entities';
import {
  HostQuestionResponseDto,
  RoomQuestionResponseDto,
} from '../dto/response';

/**
 * Question entity → ROOM-facing response DTO. DELIBERATELY omits
 * `correctAnswer` — this is the only question shape players ever receive (§16.4
 * secrecy / Этап2 §8). The omission is structural: the returned object simply
 * has no `correctAnswer` key.
 */
export function toRoomQuestionResponse(
  question: Question,
): RoomQuestionResponseDto {
  return {
    id: question.id,
    categoryId: question.categoryId,
    points: question.points,
    position: question.position,
    text: question.text,
  };
}

/**
 * Question entity → HOST-facing response DTO. The only mapper that includes
 * `correctAnswer`; used solely behind the host guard.
 */
export function toHostQuestionResponse(
  question: Question,
): HostQuestionResponseDto {
  return {
    id: question.id,
    categoryId: question.categoryId,
    points: question.points,
    position: question.position,
    text: question.text,
    correctAnswer: question.correctAnswer,
  };
}

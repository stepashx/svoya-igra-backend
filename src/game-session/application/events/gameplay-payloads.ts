import { BoardCell, Question } from '../../../gameplay/domain/entities';

/**
 * Plain-object projections used as gameplay (§16.4) event payloads. As with the
 * lobby {@link payloads}, these carry no Swagger metadata and live in the
 * application layer where the emitting use cases run. They are intentionally
 * separate from the presentation DTOs.
 */

export interface BoardCellEventSummary {
  id: string;
  categoryId: string;
  points: number;
  position: number;
  state: string;
  openedByTeamId: string | null;
  answeredByTeamId: string | null;
}

export interface RoomQuestionEventSummary {
  id: string;
  categoryId: string;
  points: number;
  position: number;
  text: string;
}

export function boardCellSummary(cell: BoardCell): BoardCellEventSummary {
  return {
    id: cell.id,
    categoryId: cell.categoryId,
    points: cell.points,
    position: cell.position,
    state: cell.state,
    openedByTeamId: cell.openedByTeamId,
    answeredByTeamId: cell.answeredByTeamId,
  };
}

/**
 * Room-facing question projection. DELIBERATELY omits `correctAnswer` — the
 * room broadcast (`question-opened`) never carries the answer (Этап2 §8 / §16.4
 * secrecy). The host obtains the answer over REST and, since 6.2b, over the
 * host-socket-only `question-correct-answer-shown-to-host` event.
 */
export function roomQuestionSummary(
  question: Question,
): RoomQuestionEventSummary {
  return {
    id: question.id,
    categoryId: question.categoryId,
    points: question.points,
    position: question.position,
    text: question.text,
  };
}

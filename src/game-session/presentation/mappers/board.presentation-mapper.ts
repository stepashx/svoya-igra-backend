import { BoardCell, Category } from '../../../gameplay/domain/entities';
import { BoardView } from '../../../gameplay/application/queries';
import { AnswerTimerState } from '../../application/timers';
import {
  BoardResponseDto,
  CategoryResponseDto,
  CellResponseDto,
  TimerResponseDto,
} from '../dto/response';

/** Category entity → public response DTO. */
export function toCategoryResponse(category: Category): CategoryResponseDto {
  return {
    id: category.id,
    title: category.title,
    position: category.position,
  };
}

/** Board cell entity → public response DTO (no question text/answer). */
export function toCellResponse(cell: BoardCell): CellResponseDto {
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

/** Board read model → full board response DTO. */
export function toBoardResponse(board: BoardView): BoardResponseDto {
  return {
    categories: board.categories.map(toCategoryResponse),
    cells: board.cells.map(toCellResponse),
  };
}

/** Answer-timer state → response DTO (Date stamps rendered as ISO strings). */
export function toTimerResponse(timer: AnswerTimerState): TimerResponseDto {
  return {
    status: timer.status,
    startedAt: timer.startedAt ? timer.startedAt.toISOString() : null,
    endsAt: timer.endsAt ? timer.endsAt.toISOString() : null,
    remainingMs: timer.remainingMs,
  };
}

import { Inject, Injectable } from '@nestjs/common';
import { BoardCell, Category, Question } from '../../domain/entities';
import {
  BOARD_CELL_REPOSITORY_PORT,
  BoardCellRepositoryPort,
  CATEGORY_REPOSITORY_PORT,
  CategoryRepositoryPort,
  QUESTION_REPOSITORY_PORT,
  QuestionRepositoryPort,
} from '../../domain/ports';

/** The full board read model: the catalog categories plus the room's cells. */
export interface BoardView {
  categories: Category[];
  cells: BoardCell[];
}

/**
 * Stateless read model for the board & questions GET endpoints (plan §15.5,
 * §15.6). Pure queries — no mutation, no events, no transaction. Returns domain
 * entities/projections; the game-session presentation layer maps them to DTOs
 * (and decides who sees `correctAnswer` — never this service).
 *
 * Lives in gameplay (which owns the board/question read models) and is exported
 * from {@link GameplayModule} so the game-session controllers can consume it
 * (Design A: Game Flow owns the battle controllers, Gameplay owns the reads).
 */
@Injectable()
export class BoardQueryService {
  constructor(
    @Inject(CATEGORY_REPOSITORY_PORT)
    private readonly categories: CategoryRepositoryPort,
    @Inject(QUESTION_REPOSITORY_PORT)
    private readonly questions: QuestionRepositoryPort,
    @Inject(BOARD_CELL_REPOSITORY_PORT)
    private readonly cells: BoardCellRepositoryPort,
  ) {}

  /** The full board for a room: the global categories and the room's cells. */
  async getBoard(roomId: string): Promise<BoardView> {
    const [categories, cells] = await Promise.all([
      this.categories.listAll(),
      this.cells.listByRoomId(roomId),
    ]);
    return { categories, cells };
  }

  /** The global category catalog (room-independent). */
  listCategories(): Promise<Category[]> {
    return this.categories.listAll();
  }

  /** Every cell of the room's board. */
  listCells(roomId: string): Promise<BoardCell[]> {
    return this.cells.listByRoomId(roomId);
  }

  /** The room's active cell (SELECTED or OPENED), or null when none is active. */
  getActiveCell(roomId: string): Promise<BoardCell | null> {
    return this.cells.findActiveByRoomId(roomId);
  }

  /**
   * The question behind the room's active OPENED cell, or null when no cell is
   * open (a merely SELECTED cell has no revealed question yet).
   */
  async getCurrentQuestion(roomId: string): Promise<Question | null> {
    const active = await this.cells.findActiveByRoomId(roomId);
    if (!active || active.state !== 'OPENED') {
      return null;
    }
    return this.questions.findById(active.questionId);
  }

  /** The global question catalog (room-independent). */
  listQuestions(): Promise<Question[]> {
    return this.questions.listAll();
  }
}

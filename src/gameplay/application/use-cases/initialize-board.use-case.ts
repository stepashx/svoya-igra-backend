import { Inject, Injectable } from '@nestjs/common';
import {
  ID_GENERATOR_PORT,
  IdGeneratorPort,
} from '../../../core/ports/id-generator.port';
import { BoardInitializationPort } from '../../../game-session/application/ports/board-initialization.port';
import { BoardCell } from '../../domain/entities';
import { BoardCatalogIncompleteError } from '../../domain/errors';
import {
  BOARD_CELL_REPOSITORY_PORT,
  BoardCellRepositoryPort,
  QUESTION_REPOSITORY_PORT,
  QuestionRepositoryPort,
} from '../../domain/ports';

/** A full board is 6 categories × 5 questions (plan §14.4). */
const FULL_BOARD_SIZE = 30;

/**
 * Seeds a room's 6×5 board from the global question catalog (plan §12, §14.4).
 * Implements the game-session {@link BoardInitializationPort}; StartGame invokes
 * it inside its transaction right after the room reaches GAME_BOARD, so the
 * inserts join that atomic unit via the transaction-aware repositories.
 *
 * Idempotent by skip-if-exists: if any cell already exists for the room it
 * returns without touching anything, so a re-entrant start never duplicates the
 * board. Each cell copies the question/category/points/position from the catalog
 * and starts AVAILABLE; the cell id comes from the {@link IdGeneratorPort}.
 */
@Injectable()
export class InitializeBoardUseCase implements BoardInitializationPort {
  constructor(
    @Inject(QUESTION_REPOSITORY_PORT)
    private readonly questions: QuestionRepositoryPort,
    @Inject(BOARD_CELL_REPOSITORY_PORT)
    private readonly cells: BoardCellRepositoryPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
  ) {}

  async initializeBoard(roomId: string): Promise<void> {
    if (await this.cells.existsByRoomId(roomId)) {
      return;
    }

    const catalog = await this.questions.listAll();
    if (catalog.length !== FULL_BOARD_SIZE) {
      throw new BoardCatalogIncompleteError();
    }

    const board = catalog.map((question) =>
      BoardCell.create({
        id: this.ids.generate(),
        roomId,
        questionId: question.id,
        categoryId: question.categoryId,
        points: question.points,
        position: question.position,
      }),
    );

    await this.cells.createMany(board);
  }
}

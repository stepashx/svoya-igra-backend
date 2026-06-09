import { IdGeneratorPort } from '../../../core/ports/id-generator.port';
import { Question } from '../../domain/entities';
import { BoardCatalogIncompleteError } from '../../domain/errors';
import {
  BoardCellRepositoryPort,
  QuestionRepositoryPort,
} from '../../domain/ports';
import { InitializeBoardUseCase } from './initialize-board.use-case';

/** Catalog costs per position (plan §14.4): 100/200/400/600/800. */
const POINTS = [100, 200, 400, 600, 800];

/** Build a catalog of `categories × perCategory` seeded questions. */
const makeCatalog = (categories = 6, perCategory = 5): Question[] => {
  const out: Question[] = [];
  for (let c = 0; c < categories; c += 1) {
    for (let p = 0; p < perCategory; p += 1) {
      out.push(
        Question.reconstitute({
          id: `q-${c}-${p}`,
          categoryId: `cat-${c}`,
          text: `Q ${c}.${p}`,
          correctAnswer: `A ${c}.${p}`,
          points: POINTS[p],
          position: p,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
    }
  }
  return out;
};

describe('InitializeBoardUseCase', () => {
  const build = (catalog: Question[]) => {
    const questions: jest.Mocked<QuestionRepositoryPort> = {
      listAll: jest.fn().mockResolvedValue(catalog),
      findById: jest.fn().mockResolvedValue(null),
      listByCategoryId: jest.fn().mockResolvedValue([]),
    };
    const cells: jest.Mocked<BoardCellRepositoryPort> = {
      createMany: jest.fn().mockResolvedValue(undefined),
      existsByRoomId: jest.fn().mockResolvedValue(false),
      findById: jest.fn().mockResolvedValue(null),
      findByRoomCategoryAndPosition: jest.fn().mockResolvedValue(null),
      listByRoomId: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(undefined),
    };
    let counter = 0;
    const ids: IdGeneratorPort = {
      generate: () => {
        counter += 1;
        return `cell-${counter}`;
      },
    };
    const uc = new InitializeBoardUseCase(questions, cells, ids);
    return { uc, questions, cells };
  };

  it('seeds a 30-cell AVAILABLE board with catalog-derived fields and generated ids', async () => {
    const { uc, cells } = build(makeCatalog());

    await uc.initializeBoard('room-1');

    expect(cells.createMany).toHaveBeenCalledTimes(1);
    const board = cells.createMany.mock.calls[0][0];
    expect(board).toHaveLength(30);
    expect(board.every((cell) => cell.state === 'AVAILABLE')).toBe(true);
    expect(board.every((cell) => cell.roomId === 'room-1')).toBe(true);
    // Every id comes from the generator and is distinct.
    expect(new Set(board.map((cell) => cell.id)).size).toBe(30);
    expect(board[0].id).toBe('cell-1');

    // The first cell mirrors the first catalog entry.
    expect(board[0].questionId).toBe('q-0-0');
    expect(board[0].categoryId).toBe('cat-0');
    expect(board[0].points).toBe(100);
    expect(board[0].position).toBe(0);

    // points/position are copied verbatim across the whole board.
    expect(board.map((cell) => cell.points).sort((a, b) => a - b)).toEqual(
      makeCatalog()
        .map((q) => q.points)
        .sort((a, b) => a - b),
    );
  });

  it('is idempotent: skips creation when a board already exists for the room', async () => {
    const { uc, questions, cells } = build(makeCatalog());
    cells.existsByRoomId.mockResolvedValue(true);

    await uc.initializeBoard('room-1');

    expect(questions.listAll).not.toHaveBeenCalled();
    expect(cells.createMany).not.toHaveBeenCalled();
  });

  it('rejects an incomplete catalog (not exactly 30 questions)', async () => {
    const { uc, cells } = build(makeCatalog(6, 4)); // 24 questions

    await expect(uc.initializeBoard('room-1')).rejects.toBeInstanceOf(
      BoardCatalogIncompleteError,
    );
    expect(cells.createMany).not.toHaveBeenCalled();
  });
});

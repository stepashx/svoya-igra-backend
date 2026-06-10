import { BoardCell, Category, Question } from '../../domain/entities';
import {
  BoardCellRepositoryPort,
  CategoryRepositoryPort,
  QuestionRepositoryPort,
} from '../../domain/ports';
import { BoardQueryService } from './board-query.service';

const makeCategoryRepo = (): jest.Mocked<CategoryRepositoryPort> => ({
  listAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
});

const makeQuestionRepo = (): jest.Mocked<QuestionRepositoryPort> => ({
  listAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn().mockResolvedValue(null),
  listByCategoryId: jest.fn().mockResolvedValue([]),
});

const makeBoardCellRepo = (): jest.Mocked<BoardCellRepositoryPort> => ({
  createMany: jest.fn().mockResolvedValue(undefined),
  existsByRoomId: jest.fn().mockResolvedValue(false),
  findById: jest.fn().mockResolvedValue(null),
  findByRoomCategoryAndPosition: jest.fn().mockResolvedValue(null),
  findActiveByRoomId: jest.fn().mockResolvedValue(null),
  listByRoomId: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockResolvedValue(undefined),
});

const category = (id: string, position: number): Category =>
  Category.reconstitute({ id, title: id, position });

const question = (id: string): Question =>
  Question.reconstitute({
    id,
    categoryId: 'category-1',
    text: `text-${id}`,
    correctAnswer: `answer-${id}`,
    points: 200,
    position: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });

const cell = (
  state: BoardCell['state'],
  questionId = 'question-1',
): BoardCell =>
  BoardCell.reconstitute({
    id: 'cell-1',
    roomId: 'room-1',
    questionId,
    categoryId: 'category-1',
    points: 200,
    position: 1,
    state,
    openedByTeamId: state === 'OPENED' ? 'team-1' : null,
    answeredByTeamId: null,
    blockedAt: null,
  });

describe('BoardQueryService', () => {
  const build = () => {
    const categories = makeCategoryRepo();
    const questions = makeQuestionRepo();
    const cells = makeBoardCellRepo();
    const service = new BoardQueryService(categories, questions, cells);
    return { service, categories, questions, cells };
  };

  it('getBoard returns the categories and the room cells together', async () => {
    const { service, categories, cells } = build();
    categories.listAll.mockResolvedValue([
      category('c-1', 0),
      category('c-2', 1),
    ]);
    cells.listByRoomId.mockResolvedValue([cell('AVAILABLE')]);

    const board = await service.getBoard('room-1');

    expect(board.categories).toHaveLength(2);
    expect(board.cells).toHaveLength(1);
    expect(cells.listByRoomId).toHaveBeenCalledWith('room-1');
  });

  it('listCells delegates to the cell repository for the room', async () => {
    const { service, cells } = build();
    cells.listByRoomId.mockResolvedValue([cell('OPENED')]);
    const result = await service.listCells('room-1');
    expect(result).toHaveLength(1);
    expect(cells.listByRoomId).toHaveBeenCalledWith('room-1');
  });

  it('getActiveCell returns the active cell from the repository', async () => {
    const { service, cells } = build();
    cells.findActiveByRoomId.mockResolvedValue(cell('SELECTED'));
    const active = await service.getActiveCell('room-1');
    expect(active?.state).toBe('SELECTED');
    expect(cells.findActiveByRoomId).toHaveBeenCalledWith('room-1');
  });

  it('getCurrentQuestion returns the question when a cell is OPENED', async () => {
    const { service, cells, questions } = build();
    cells.findActiveByRoomId.mockResolvedValue(cell('OPENED', 'question-9'));
    questions.findById.mockResolvedValue(question('question-9'));

    const current = await service.getCurrentQuestion('room-1');

    expect(current?.id).toBe('question-9');
    expect(questions.findById).toHaveBeenCalledWith('question-9');
  });

  it('getCurrentQuestion returns null when the active cell is only SELECTED', async () => {
    const { service, cells, questions } = build();
    cells.findActiveByRoomId.mockResolvedValue(cell('SELECTED'));

    const current = await service.getCurrentQuestion('room-1');

    expect(current).toBeNull();
    expect(questions.findById).not.toHaveBeenCalled();
  });

  it('getCurrentQuestion returns null when there is no active cell', async () => {
    const { service, cells } = build();
    cells.findActiveByRoomId.mockResolvedValue(null);
    await expect(service.getCurrentQuestion('room-1')).resolves.toBeNull();
  });
});

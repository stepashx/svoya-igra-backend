import {
  BoardCell,
  Category,
  Question,
} from '../../../gameplay/domain/entities';
import { AnswerTimerState } from '../../application/timers';
import {
  toBoardResponse,
  toCategoryResponse,
  toCellResponse,
  toTimerResponse,
} from './board.presentation-mapper';
import {
  toHostQuestionResponse,
  toRoomQuestionResponse,
} from './question.presentation-mapper';

const question = (): Question =>
  Question.reconstitute({
    id: 'question-1',
    categoryId: 'category-1',
    text: 'What is the capital of France?',
    correctAnswer: 'Paris',
    points: 200,
    position: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });

const cell = (): BoardCell =>
  BoardCell.reconstitute({
    id: 'cell-1',
    roomId: 'room-1',
    questionId: 'question-1',
    categoryId: 'category-1',
    points: 200,
    position: 1,
    state: 'OPENED',
    openedByTeamId: 'team-1',
    answeredByTeamId: null,
    blockedAt: null,
  });

describe('gameplay presentation mappers', () => {
  describe('question mappers (R3 secrecy)', () => {
    it('toRoomQuestionResponse omits correctAnswer entirely', () => {
      const dto = toRoomQuestionResponse(question());
      expect(dto).toEqual({
        id: 'question-1',
        categoryId: 'category-1',
        points: 200,
        position: 1,
        text: 'What is the capital of France?',
      });
      expect(dto).not.toHaveProperty('correctAnswer');
      expect(Object.keys(dto)).not.toContain('correctAnswer');
    });

    it('toHostQuestionResponse is the only one that includes correctAnswer', () => {
      const dto = toHostQuestionResponse(question());
      expect(dto).toHaveProperty('correctAnswer', 'Paris');
      expect(dto.text).toBe('What is the capital of France?');
    });
  });

  describe('board / cell / category mappers', () => {
    it('toCellResponse never exposes question text or answer', () => {
      const dto = toCellResponse(cell());
      expect(dto).toEqual({
        id: 'cell-1',
        categoryId: 'category-1',
        points: 200,
        position: 1,
        state: 'OPENED',
        openedByTeamId: 'team-1',
        answeredByTeamId: null,
      });
      expect(dto).not.toHaveProperty('text');
      expect(dto).not.toHaveProperty('correctAnswer');
      expect(dto).not.toHaveProperty('questionId');
    });

    it('toCategoryResponse maps the public fields', () => {
      const dto = toCategoryResponse(
        Category.reconstitute({
          id: 'category-1',
          title: 'Geography',
          position: 0,
        }),
      );
      expect(dto).toEqual({
        id: 'category-1',
        title: 'Geography',
        position: 0,
      });
    });

    it('toBoardResponse maps both collections', () => {
      const dto = toBoardResponse({
        categories: [
          Category.reconstitute({
            id: 'category-1',
            title: 'Geo',
            position: 0,
          }),
        ],
        cells: [cell()],
      });
      expect(dto.categories).toHaveLength(1);
      expect(dto.cells).toHaveLength(1);
      expect(dto.cells[0]).not.toHaveProperty('text');
    });
  });

  describe('timer mapper', () => {
    it('renders RUNNING stamps as ISO strings', () => {
      const state: AnswerTimerState = {
        status: 'RUNNING',
        startedAt: new Date('2026-06-10T12:00:00.000Z'),
        endsAt: new Date('2026-06-10T12:01:00.000Z'),
        remainingMs: 60_000,
      };
      expect(toTimerResponse(state)).toEqual({
        status: 'RUNNING',
        startedAt: '2026-06-10T12:00:00.000Z',
        endsAt: '2026-06-10T12:01:00.000Z',
        remainingMs: 60_000,
      });
    });

    it('renders IDLE with null stamps', () => {
      const state: AnswerTimerState = {
        status: 'IDLE',
        startedAt: null,
        endsAt: null,
        remainingMs: 0,
      };
      expect(toTimerResponse(state)).toEqual({
        status: 'IDLE',
        startedAt: null,
        endsAt: null,
        remainingMs: 0,
      });
    });
  });
});

import { BoardQueryService } from '../../../gameplay/application/queries';
import { LobbyQueryService } from '../../application/queries';
import {
  OpenQuestionUseCase,
  RejectSelectionUseCase,
  ReviewAnswerUseCase,
  SubmitAnswerUseCase,
} from '../../application/use-cases';
import {
  FIXED_NOW,
  makeBoardCell,
  makePlayer,
  makeQuestion,
  makeRoom,
  makeTimerRegistry,
} from '../../application/use-cases/lobby-test-doubles';
import { QuestionsController } from './questions.controller';

describe('QuestionsController', () => {
  const host = { roomId: 'room-1', hostId: 'host-1' };

  const build = () => {
    const boardQuery = {
      getCurrentQuestion: jest.fn(),
      listQuestions: jest.fn(),
      getBoard: jest.fn(),
    } as unknown as jest.Mocked<BoardQueryService>;
    const lobby = {
      getRoom: jest.fn().mockResolvedValue(makeRoom({ id: 'room-1' })),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const openQuestion = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<OpenQuestionUseCase>;
    const rejectSelection = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<RejectSelectionUseCase>;
    const submitAnswer = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SubmitAnswerUseCase>;
    const reviewAnswer = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReviewAnswerUseCase>;
    const controller = new QuestionsController(
      boardQuery,
      lobby,
      openQuestion,
      rejectSelection,
      submitAnswer,
      reviewAnswer,
    );
    return {
      controller,
      boardQuery,
      openQuestion,
      rejectSelection,
      submitAnswer,
      reviewAnswer,
    };
  };

  it('returns the current room question WITHOUT the answer (or null)', async () => {
    const { controller, boardQuery } = build();
    boardQuery.getCurrentQuestion.mockResolvedValue(
      makeQuestion({ correctAnswer: 'secret' }),
    );
    const res = await controller.getCurrent('ABCDEF');
    expect(res).not.toHaveProperty('correctAnswer');

    boardQuery.getCurrentQuestion.mockResolvedValue(null);
    expect(await controller.getCurrent('ABCDEF')).toBeNull();
  });

  it('exposes the answer to the host (host view + bare answer)', async () => {
    const { controller, boardQuery } = build();
    boardQuery.getCurrentQuestion.mockResolvedValue(
      makeQuestion({ correctAnswer: 'Paris' }),
    );
    expect((await controller.getCurrentForHost(host))?.correctAnswer).toBe(
      'Paris',
    );
    expect(await controller.getCurrentAnswer(host)).toEqual({
      correctAnswer: 'Paris',
    });

    boardQuery.getCurrentQuestion.mockResolvedValue(null);
    expect(await controller.getCurrentAnswer(host)).toEqual({
      correctAnswer: null,
    });
  });

  it('opens a question, returning the host view and the started timer', async () => {
    const { controller, openQuestion } = build();
    const timer = makeTimerRegistry(60).start(
      'room-1',
      'cell-1',
      'question-1',
      FIXED_NOW,
    );
    openQuestion.execute.mockResolvedValue({
      cell: makeBoardCell({ state: 'OPENED' }),
      question: makeQuestion({ correctAnswer: 'Paris' }),
      timer,
    });
    const res = await controller.open(host, { cellId: 'cell-1' });
    expect(openQuestion.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      cellId: 'cell-1',
    });
    expect(res.question.correctAnswer).toBe('Paris');
    expect(res.timer.status).toBe('RUNNING');
  });

  it('submits an answer, returning the room view and the new stage', async () => {
    const { controller, submitAnswer } = build();
    submitAnswer.execute.mockResolvedValue({
      cell: makeBoardCell(),
      question: makeQuestion({ correctAnswer: 'secret' }),
      stage: 'ANSWER_REVIEW',
    });
    const player = makePlayer({ id: 'p1', roomId: 'room-1' });
    const res = await controller.answer(player, { answer: 'Paris' });
    expect(submitAnswer.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      actingPlayerId: 'p1',
      answer: 'Paris',
    });
    expect(res.stage).toBe('ANSWER_REVIEW');
    expect(res.question).not.toHaveProperty('correctAnswer');
  });

  it('reviews the answer and returns the updated board snapshot', async () => {
    const { controller, reviewAnswer, boardQuery } = build();
    reviewAnswer.execute.mockResolvedValue({
      room: makeRoom(),
      cell: makeBoardCell({ state: 'BLOCKED' }),
      nextTeamId: 'team-2',
    });
    boardQuery.getBoard.mockResolvedValue({
      categories: [],
      cells: [makeBoardCell({ state: 'BLOCKED' })],
    });
    const res = await controller.review(host, { accepted: true });
    expect(reviewAnswer.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      accepted: true,
      revealAnswer: undefined,
    });
    expect(res.cells).toHaveLength(1);
  });
});

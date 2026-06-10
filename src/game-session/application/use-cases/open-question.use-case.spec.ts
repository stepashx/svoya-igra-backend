import {
  NoActiveCellError,
  QuestionNotFoundError,
  UnexpectedGameStageError,
} from '../../../gameplay/domain/errors';
import { GameplayEvent } from '../events';
import { OpenQuestionUseCase } from './open-question.use-case';
import {
  FIXED_NOW,
  makeBoardCell,
  makeBoardCellRepo,
  makeClock,
  makeQuestion,
  makeQuestionRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTimerRegistry,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('OpenQuestionUseCase', () => {
  const ANSWER_SECONDS = 60;

  const build = () => {
    const rooms = makeRoomRepo();
    const cells = makeBoardCellRepo();
    const questions = makeQuestionRepo();
    const realtime = makeRealtime();
    const timer = makeTimerRegistry(ANSWER_SECONDS);
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'GAME_BOARD', currentTeamId: 'team-1' }),
    );
    cells.findActiveByRoomId.mockResolvedValue(
      makeBoardCell({ id: 'cell-1', state: 'SELECTED' }),
    );
    questions.findById.mockResolvedValue(
      makeQuestion({ id: 'question-1', correctAnswer: 'Paris' }),
    );
    const uc = new OpenQuestionUseCase(
      rooms,
      cells,
      questions,
      realtime,
      makeClock(),
      makeTransactionPort(),
      timer,
    );
    return { uc, rooms, cells, questions, realtime, timer };
  };

  const input = { roomId: 'room-1', cellId: 'cell-1' };

  it('opens the selected cell, advances to QUESTION_OPENED, and starts the timer', async () => {
    const { uc, rooms, cells, realtime } = build();

    const result = await uc.execute(input);

    expect(result.cell.state).toBe('OPENED');
    expect(result.cell.openedByTeamId).toBe('team-1');
    expect(result.timer.status).toBe('RUNNING');
    expect(result.timer.endsAt).toEqual(
      new Date(FIXED_NOW.getTime() + ANSWER_SECONDS * 1000),
    );
    expect(cells.update).toHaveBeenCalled();

    const updatedRoom = rooms.update.mock.calls[0][0];
    expect(updatedRoom.currentStage).toBe('QUESTION_OPENED');

    const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
    expect(emitted).toEqual(
      expect.arrayContaining([
        GameplayEvent.CellSelectionApproved,
        GameplayEvent.QuestionOpened,
        GameplayEvent.QuestionTimerStarted,
      ]),
    );
  });

  it('never leaks the correct answer in the question-opened broadcast', async () => {
    const { uc, realtime } = build();
    await uc.execute(input);

    const openedCall = realtime.emitToRoom.mock.calls.find(
      ([, event]) => event === GameplayEvent.QuestionOpened,
    );
    const payload = openedCall?.[2] as { question: Record<string, unknown> };
    expect(payload.question).toHaveProperty('text');
    expect(payload.question).not.toHaveProperty('correctAnswer');
  });

  it('rejects when there is no SELECTED active cell', async () => {
    const { uc, cells } = build();
    cells.findActiveByRoomId.mockResolvedValue(null);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(NoActiveCellError);
  });

  it('rejects when the question is missing from the catalog', async () => {
    const { uc, questions } = build();
    questions.findById.mockResolvedValue(null);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      QuestionNotFoundError,
    );
  });

  it('rejects opening outside GAME_BOARD', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'QUESTION_OPENED', currentTeamId: 'team-1' }),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
  });
});

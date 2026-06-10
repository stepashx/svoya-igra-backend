import {
  AnswerTimeExpiredError,
  NotActiveTeamCaptainError,
  UnexpectedGameStageError,
} from '../../../gameplay/domain/errors';
import { GameplayEvent } from '../events';
import { SubmitAnswerUseCase } from './submit-answer.use-case';
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
  makeTeam,
  makeTeamRepo,
  makeTimerRegistry,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('SubmitAnswerUseCase', () => {
  const ANSWER_SECONDS = 60;

  const build = (now: Date = FIXED_NOW) => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const cells = makeBoardCellRepo();
    const questions = makeQuestionRepo();
    const realtime = makeRealtime();
    const timer = makeTimerRegistry(ANSWER_SECONDS);
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'QUESTION_OPENED', currentTeamId: 'team-1' }),
    );
    teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', captainPlayerId: 'captain-1', turnOrder: 0 }),
    );
    cells.findActiveByRoomId.mockResolvedValue(
      makeBoardCell({
        id: 'cell-1',
        state: 'OPENED',
        openedByTeamId: 'team-1',
      }),
    );
    questions.findById.mockResolvedValue(makeQuestion());
    // Timer running from FIXED_NOW.
    timer.start('room-1', 'cell-1', 'question-1', FIXED_NOW);
    const uc = new SubmitAnswerUseCase(
      rooms,
      teams,
      cells,
      questions,
      realtime,
      makeClock(now),
      makeTransactionPort(),
      timer,
    );
    return { uc, rooms, realtime };
  };

  const input = {
    roomId: 'room-1',
    actingPlayerId: 'captain-1',
    answer: 'Paris',
  };

  it('submits on time, advances to ANSWER_REVIEW, broadcasts answer-submitted', async () => {
    const { uc, rooms, realtime } = build();

    const result = await uc.execute(input);

    expect(result.stage).toBe('ANSWER_REVIEW');
    const updatedRoom = rooms.update.mock.calls[0][0];
    expect(updatedRoom.currentStage).toBe('ANSWER_REVIEW');
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameplayEvent.AnswerSubmitted,
      expect.objectContaining({
        cellId: 'cell-1',
        teamId: 'team-1',
        answer: 'Paris',
      }),
    );
  });

  it('forbids a player who is not the active team captain', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ ...input, actingPlayerId: 'not-captain' }),
    ).rejects.toBeInstanceOf(NotActiveTeamCaptainError);
  });

  it('rejects a late answer once the timer has expired', async () => {
    const { uc } = build(
      new Date(FIXED_NOW.getTime() + (ANSWER_SECONDS + 1) * 1000),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      AnswerTimeExpiredError,
    );
  });

  it('rejects submitting outside QUESTION_OPENED', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'GAME_BOARD', currentTeamId: 'team-1' }),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
  });
});

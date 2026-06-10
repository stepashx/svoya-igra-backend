import {
  NoActiveCellError,
  QuestionNotFoundError,
  UnexpectedGameStageError,
} from '../../../gameplay/domain/errors';
import { GameSessionEvent, GameplayEvent } from '../events';
import { ReviewAnswerUseCase } from './review-answer.use-case';
import {
  FIXED_NOW,
  makeBoardCell,
  makeBoardCellRepo,
  makeClock,
  makeHostRealtime,
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

describe('ReviewAnswerUseCase', () => {
  const participants = () => [
    makeTeam({ id: 'team-1', turnOrder: 0 }),
    makeTeam({ id: 'team-2', turnOrder: 1 }),
  ];

  const build = (currentTeamId = 'team-1') => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const cells = makeBoardCellRepo();
    const questions = makeQuestionRepo();
    const realtime = makeRealtime();
    const hostRealtime = makeHostRealtime();
    const timer = makeTimerRegistry();
    rooms.findById.mockResolvedValue(
      makeRoom({
        currentStage: 'ANSWER_REVIEW',
        currentTeamId,
        blockedQuestionsCount: 0,
      }),
    );
    cells.findActiveByRoomId.mockResolvedValue(
      makeBoardCell({
        id: 'cell-1',
        state: 'OPENED',
        openedByTeamId: 'team-1',
      }),
    );
    questions.findById.mockResolvedValue(makeQuestion());
    teams.findByRoomId.mockResolvedValue(participants());
    cells.listByRoomId.mockResolvedValue([
      makeBoardCell({ id: 'cell-1', state: 'BLOCKED' }),
    ]);
    timer.start('room-1', 'cell-1', 'question-1', FIXED_NOW);
    const uc = new ReviewAnswerUseCase(
      rooms,
      teams,
      cells,
      questions,
      realtime,
      hostRealtime,
      makeClock(),
      makeTransactionPort(),
      timer,
    );
    return { uc, rooms, cells, questions, realtime, hostRealtime, timer };
  };

  it('accepts: blocks the cell to the opener, advances turn, clears timer, emits events', async () => {
    const { uc, rooms, realtime, timer } = build('team-1');

    const result = await uc.execute({ roomId: 'room-1', accepted: true });

    expect(result.cell.state).toBe('BLOCKED');
    expect(result.cell.answeredByTeamId).toBe('team-1');
    expect(result.nextTeamId).toBe('team-2');

    const updatedRoom = rooms.update.mock.calls[0][0];
    expect(updatedRoom.currentStage).toBe('GAME_BOARD');
    expect(updatedRoom.blockedQuestionsCount).toBe(1);
    expect(updatedRoom.currentTeamId).toBe('team-2');

    // Timer cleared (round-robin done).
    expect(timer.read('room-1', FIXED_NOW).status).toBe('IDLE');

    const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
    expect(emitted).toEqual(
      expect.arrayContaining([
        GameplayEvent.AnswerAccepted,
        GameplayEvent.CellBlocked,
        GameSessionEvent.GameTurnChanged,
        GameplayEvent.BoardStateUpdated,
      ]),
    );
    expect(emitted).not.toContain(GameplayEvent.AnswerRejected);
  });

  it('rejects: blocks the cell with no answerer and emits answer-rejected', async () => {
    const { uc, realtime } = build('team-1');

    const result = await uc.execute({ roomId: 'room-1', accepted: false });

    expect(result.cell.state).toBe('BLOCKED');
    expect(result.cell.answeredByTeamId).toBeNull();

    const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
    expect(emitted).toContain(GameplayEvent.AnswerRejected);
    expect(emitted).not.toContain(GameplayEvent.AnswerAccepted);
  });

  it('wraps the turn around from the last team to the first', async () => {
    const { uc, rooms } = build('team-2');
    await uc.execute({ roomId: 'room-1', accepted: true });
    const updatedRoom = rooms.update.mock.calls[0][0];
    expect(updatedRoom.currentTeamId).toBe('team-1');
  });

  it('rejects reviewing outside ANSWER_REVIEW', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'GAME_BOARD', currentTeamId: 'team-1' }),
    );
    await expect(
      uc.execute({ roomId: 'room-1', accepted: true }),
    ).rejects.toBeInstanceOf(UnexpectedGameStageError);
  });

  it('rejects when there is no OPENED active cell (e.g. already blocked)', async () => {
    const { uc, cells } = build();
    cells.findActiveByRoomId.mockResolvedValue(null);
    await expect(
      uc.execute({ roomId: 'room-1', accepted: true }),
    ).rejects.toBeInstanceOf(NoActiveCellError);
  });

  describe('revealAnswer (host-only delivery, 6.2b)', () => {
    it('revealAnswer:true emits the correct answer to the host exactly once', async () => {
      const { uc, questions, hostRealtime } = build('team-1');

      await uc.execute({
        roomId: 'room-1',
        accepted: true,
        revealAnswer: true,
      });

      expect(questions.findById).toHaveBeenCalledWith('question-1');
      expect(hostRealtime.emitToHost).toHaveBeenCalledTimes(1);
      expect(hostRealtime.emitToHost).toHaveBeenCalledWith(
        'room-1',
        GameplayEvent.QuestionCorrectAnswerShownToHost,
        { roomId: 'room-1', cellId: 'cell-1', correctAnswer: 'Paris' },
      );
    });

    it.each([undefined, false])(
      'revealAnswer %p neither loads the question nor emits to the host',
      async (revealAnswer) => {
        const { uc, questions, hostRealtime } = build('team-1');

        await uc.execute({ roomId: 'room-1', accepted: true, revealAnswer });

        expect(questions.findById).not.toHaveBeenCalled();
        expect(hostRealtime.emitToHost).not.toHaveBeenCalled();
      },
    );

    it('aborts on a missing question before any mutation or emission', async () => {
      const { uc, questions, realtime, hostRealtime } = build('team-1');
      questions.findById.mockResolvedValue(null);

      await expect(
        uc.execute({ roomId: 'room-1', accepted: true, revealAnswer: true }),
      ).rejects.toBeInstanceOf(QuestionNotFoundError);

      // The question loads before the emission block: nothing leaked.
      expect(realtime.emitToRoom).not.toHaveBeenCalled();
      expect(hostRealtime.emitToHost).not.toHaveBeenCalled();
    });

    it('R3: no room-wide payload ever contains the correct answer', async () => {
      const { uc, realtime } = build('team-1');

      await uc.execute({
        roomId: 'room-1',
        accepted: true,
        revealAnswer: true,
      });

      expect(realtime.emitToRoom).toHaveBeenCalled();
      for (const [, , payload] of realtime.emitToRoom.mock.calls) {
        expect(payload).not.toHaveProperty('correctAnswer');
        expect(JSON.stringify(payload)).not.toContain('Paris');
      }
    });
  });
});

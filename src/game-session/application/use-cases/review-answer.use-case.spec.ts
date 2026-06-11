import {
  NoActiveCellError,
  QuestionNotFoundError,
  UnexpectedGameStageError,
} from '../../../gameplay/domain/errors';
import { CommerceEvent, GameSessionEvent, GameplayEvent } from '../events';
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
  makeShopTimerRegistry,
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

  const build = (currentTeamId = 'team-1', blockedQuestionsCount = 0) => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const cells = makeBoardCellRepo();
    const questions = makeQuestionRepo();
    const realtime = makeRealtime();
    const hostRealtime = makeHostRealtime();
    const timer = makeTimerRegistry();
    const shopTimer = makeShopTimerRegistry();
    rooms.findById.mockResolvedValue(
      makeRoom({
        currentStage: 'ANSWER_REVIEW',
        currentTeamId,
        blockedQuestionsCount,
      }),
    );
    cells.findActiveByRoomId.mockResolvedValue(
      makeBoardCell({
        id: 'cell-1',
        state: 'OPENED',
        openedByTeamId: 'team-1',
        points: 300,
      }),
    );
    questions.findById.mockResolvedValue(makeQuestion());
    const roomTeams = participants();
    teams.findByRoomId.mockResolvedValue(roomTeams);
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
      shopTimer,
    );
    return {
      uc,
      rooms,
      teams,
      roomTeams,
      cells,
      questions,
      realtime,
      hostRealtime,
      timer,
      shopTimer,
    };
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

  describe('scoring (§14.7, Stage 7.1)', () => {
    it('accepted: awards the cell points to the opening team and persists it', async () => {
      const { uc, teams } = build('team-1');

      await uc.execute({ roomId: 'room-1', accepted: true });

      expect(teams.update).toHaveBeenCalledTimes(1);
      const awarded = teams.update.mock.calls[0][0];
      expect(awarded.id).toBe('team-1');
      expect(awarded.earnedScore.value).toBe(300);
      expect(awarded.balance.value).toBe(300);
    });

    it('accepted: broadcasts score-changed with the post-award scores', async () => {
      const { uc, realtime } = build('team-1');

      await uc.execute({ roomId: 'room-1', accepted: true });

      expect(realtime.emitToRoom).toHaveBeenCalledWith(
        'room-1',
        GameplayEvent.ScoreChanged,
        {
          roomId: 'room-1',
          teamId: 'team-1',
          earnedScore: 300,
          balance: 300,
          delta: 300,
        },
      );
    });

    it('emits score-changed after answer-accepted and before cell-blocked', async () => {
      const { uc, realtime } = build('team-1');

      await uc.execute({ roomId: 'room-1', accepted: true });

      const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
      const scoreIndex = emitted.indexOf(GameplayEvent.ScoreChanged);
      expect(scoreIndex).toBeGreaterThan(
        emitted.indexOf(GameplayEvent.AnswerAccepted),
      );
      expect(scoreIndex).toBeLessThan(
        emitted.indexOf(GameplayEvent.CellBlocked),
      );
    });

    it('awards the OPENING team even when it is not the current team', async () => {
      const { uc, teams } = build('team-2'); // current: team-2, opener: team-1

      await uc.execute({ roomId: 'room-1', accepted: true });

      const awarded = teams.update.mock.calls[0][0];
      expect(awarded.id).toBe('team-1');
      expect(awarded.earnedScore.value).toBe(300);
      expect(awarded.balance.value).toBe(300);
    });

    it('rejected: changes no score, persists no team, emits no score-changed', async () => {
      const { uc, teams, roomTeams, realtime } = build('team-1');

      await uc.execute({ roomId: 'room-1', accepted: false });

      expect(teams.update).not.toHaveBeenCalled();
      const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
      expect(emitted).not.toContain(GameplayEvent.ScoreChanged);
      for (const team of roomTeams) {
        expect(team.earnedScore.value).toBe(0);
        expect(team.balance.value).toBe(0);
      }
    });
  });

  describe('shop cadence (§14.8, Stage 8.2)', () => {
    const COMMERCE_OPENINGS: string[] = [
      CommerceEvent.ShopOpened,
      CommerceEvent.ShopFinalOpened,
    ];

    it('a non-threshold block returns to GAME_BOARD with no shop side effects', async () => {
      // blocked 4 → 5: not a multiple of 6, board not exhausted.
      const { uc, rooms, realtime, shopTimer } = build('team-1', 4);

      await uc.execute({ roomId: 'room-1', accepted: true });

      const updatedRoom = rooms.update.mock.calls[0][0];
      expect(updatedRoom.currentStage).toBe('GAME_BOARD');
      expect(updatedRoom.blockedQuestionsCount).toBe(5);
      expect(updatedRoom.currentShopRound).toBe(0);

      const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
      for (const opening of COMMERCE_OPENINGS) {
        expect(emitted).not.toContain(opening);
      }
      expect(shopTimer.read('room-1', FIXED_NOW).status).toBe('IDLE');
    });

    it('the 6th block enters SHOP: round 1, timer started, shop-opened LAST', async () => {
      const { uc, rooms, realtime, shopTimer } = build('team-1', 5);

      await uc.execute({ roomId: 'room-1', accepted: true });

      const updatedRoom = rooms.update.mock.calls[0][0];
      expect(updatedRoom.currentStage).toBe('SHOP');
      expect(updatedRoom.blockedQuestionsCount).toBe(6);
      expect(updatedRoom.currentShopRound).toBe(1);
      // The turn still moves on a shop entry (Этап2 §16).
      expect(updatedRoom.currentTeamId).toBe('team-2');

      const state = shopTimer.read('room-1', FIXED_NOW);
      expect(state.status).toBe('RUNNING');

      // The six pre-8.2 broadcasts are all present; shop-opened is appended
      // LAST, after board-state-updated.
      const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
      expect(emitted).toEqual([
        GameplayEvent.AnswerAccepted,
        GameplayEvent.ScoreChanged,
        GameplayEvent.CellBlocked,
        GameSessionEvent.GameTurnChanged,
        GameplayEvent.BoardStateUpdated,
        CommerceEvent.ShopOpened,
      ]);

      const [, , payload] =
        realtime.emitToRoom.mock.calls[
          realtime.emitToRoom.mock.calls.length - 1
        ];
      expect(payload).toEqual({
        roomId: 'room-1',
        currentShopRound: 1,
        startedAt: state.startedAt,
        endsAt: state.endsAt,
        minClosableAt: state.minClosableAt,
      });
    });

    it('a REJECTED review on the threshold also enters SHOP (blocked count, not correctness)', async () => {
      const { uc, rooms, realtime } = build('team-1', 5);

      await uc.execute({ roomId: 'room-1', accepted: false });

      const updatedRoom = rooms.update.mock.calls[0][0];
      expect(updatedRoom.currentStage).toBe('SHOP');
      expect(updatedRoom.currentShopRound).toBe(1);
      const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
      expect(emitted).toContain(CommerceEvent.ShopOpened);
      expect(emitted).not.toContain(GameplayEvent.ScoreChanged);
    });

    it('the 30th block opens the FINAL shop: shop-final-opened, not shop-opened', async () => {
      const { uc, rooms, realtime } = build('team-1', 29);

      await uc.execute({ roomId: 'room-1', accepted: true });

      const updatedRoom = rooms.update.mock.calls[0][0];
      expect(updatedRoom.currentStage).toBe('SHOP');
      expect(updatedRoom.isBoardExhausted).toBe(true);
      const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
      expect(emitted[emitted.length - 1]).toBe(CommerceEvent.ShopFinalOpened);
      expect(emitted).not.toContain(CommerceEvent.ShopOpened);
    });
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

import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { GameplayEvent } from '../events';
import { AdvanceOnTimeoutUseCase } from './advance-on-timeout.use-case';
import {
  FIXED_NOW,
  makeBoardCell,
  makeBoardCellRepo,
  makeClock,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTimerRegistry,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('AdvanceOnTimeoutUseCase', () => {
  const ANSWER_SECONDS = 60;
  const expiredNow = new Date(
    FIXED_NOW.getTime() + (ANSWER_SECONDS + 1) * 1000,
  );

  const build = (now: Date = expiredNow) => {
    const rooms = makeRoomRepo();
    const cells = makeBoardCellRepo();
    const realtime = makeRealtime();
    const timer = makeTimerRegistry(ANSWER_SECONDS);
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'QUESTION_OPENED', currentTeamId: 'team-1' }),
    );
    cells.findActiveByRoomId.mockResolvedValue(
      makeBoardCell({
        id: 'cell-1',
        state: 'OPENED',
        openedByTeamId: 'team-1',
      }),
    );
    timer.start('room-1', 'cell-1', 'question-1', FIXED_NOW);
    const uc = new AdvanceOnTimeoutUseCase(
      rooms,
      cells,
      realtime,
      makeClock(now),
      makeTransactionPort(),
      timer,
    );
    return { uc, rooms, realtime };
  };

  it('bridges QUESTION_OPENED → ANSWER_REVIEW when the timer has expired', async () => {
    const { uc, rooms, realtime } = build();

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result.stage).toBe('ANSWER_REVIEW');
    const updatedRoom = rooms.update.mock.calls[0][0];
    expect(updatedRoom.currentStage).toBe('ANSWER_REVIEW');
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameplayEvent.QuestionTimerEnded,
      expect.objectContaining({ cellId: 'cell-1' }),
    );
  });

  it('rejects advancing outside QUESTION_OPENED', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'GAME_BOARD', currentTeamId: 'team-1' }),
    );
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
  });

  it('rejects advancing while the timer is still running', async () => {
    const { uc } = build(new Date(FIXED_NOW.getTime() + 1_000));
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toThrow(
      /has not expired/,
    );
  });
});

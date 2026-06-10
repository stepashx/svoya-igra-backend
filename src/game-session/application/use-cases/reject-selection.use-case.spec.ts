import {
  NoActiveCellError,
  UnexpectedGameStageError,
} from '../../../gameplay/domain/errors';
import { GameplayEvent } from '../events';
import { RejectSelectionUseCase } from './reject-selection.use-case';
import {
  makeBoardCell,
  makeBoardCellRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('RejectSelectionUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const cells = makeBoardCellRepo();
    const realtime = makeRealtime();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'GAME_BOARD', currentTeamId: 'team-1' }),
    );
    cells.findActiveByRoomId.mockResolvedValue(
      makeBoardCell({ id: 'cell-1', state: 'SELECTED' }),
    );
    cells.listByRoomId.mockResolvedValue([
      makeBoardCell({ id: 'cell-1', state: 'AVAILABLE' }),
    ]);
    const uc = new RejectSelectionUseCase(
      rooms,
      cells,
      realtime,
      makeTransactionPort(),
    );
    return { uc, rooms, cells, realtime };
  };

  const input = { roomId: 'room-1', cellId: 'cell-1' };

  it('deselects the cell, stays in GAME_BOARD, broadcasts rejected + board-state-updated', async () => {
    const { uc, rooms, cells, realtime } = build();

    const cell = await uc.execute(input);

    expect(cell.state).toBe('AVAILABLE');
    expect(cells.update).toHaveBeenCalledWith(cell);
    expect(rooms.update).not.toHaveBeenCalled(); // stage unchanged

    const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
    expect(emitted).toEqual(
      expect.arrayContaining([
        GameplayEvent.CellSelectionRejected,
        GameplayEvent.BoardStateUpdated,
      ]),
    );
  });

  it('rejects when there is no SELECTED active cell', async () => {
    const { uc, cells } = build();
    cells.findActiveByRoomId.mockResolvedValue(null);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(NoActiveCellError);
  });

  it('rejects rejecting outside GAME_BOARD', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'ANSWER_REVIEW', currentTeamId: 'team-1' }),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
  });
});

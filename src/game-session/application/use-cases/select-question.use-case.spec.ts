import {
  BoardCellNotFoundError,
  CellNotAvailableError,
  CellSelectionInProgressError,
  NotActiveTeamCaptainError,
  UnexpectedGameStageError,
} from '../../../gameplay/domain/errors';
import { GameplayEvent } from '../events';
import { SelectQuestionUseCase } from './select-question.use-case';
import {
  makeBoardCell,
  makeBoardCellRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTeam,
  makeTeamRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('SelectQuestionUseCase', () => {
  const build = () => {
    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const cells = makeBoardCellRepo();
    const realtime = makeRealtime();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'GAME_BOARD', currentTeamId: 'team-1' }),
    );
    teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', captainPlayerId: 'captain-1', turnOrder: 0 }),
    );
    cells.findActiveByRoomId.mockResolvedValue(null);
    cells.findById.mockResolvedValue(
      makeBoardCell({ id: 'cell-1', state: 'AVAILABLE' }),
    );
    const uc = new SelectQuestionUseCase(
      rooms,
      teams,
      cells,
      realtime,
      makeTransactionPort(),
    );
    return { uc, rooms, teams, cells, realtime };
  };

  const input = {
    roomId: 'room-1',
    actingPlayerId: 'captain-1',
    cellId: 'cell-1',
  };

  it('selects an available cell and broadcasts cell-selection-requested', async () => {
    const { uc, cells, realtime } = build();
    const cell = await uc.execute(input);
    expect(cell.state).toBe('SELECTED');
    expect(cells.update).toHaveBeenCalledWith(cell);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      GameplayEvent.CellSelectionRequested,
      expect.objectContaining({ roomId: 'room-1' }),
    );
  });

  it('forbids a player who is not the active team captain', async () => {
    const { uc } = build();
    await expect(
      uc.execute({ ...input, actingPlayerId: 'someone-else' }),
    ).rejects.toBeInstanceOf(NotActiveTeamCaptainError);
  });

  it('rejects selecting outside GAME_BOARD', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'QUESTION_OPENED', currentTeamId: 'team-1' }),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
  });

  it('rejects selecting a cell that is not AVAILABLE', async () => {
    const { uc, cells } = build();
    cells.findById.mockResolvedValue(
      makeBoardCell({ id: 'cell-1', state: 'BLOCKED', blockedAt: new Date() }),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      CellNotAvailableError,
    );
  });

  it('rejects when the cell does not exist in the room', async () => {
    const { uc, cells } = build();
    cells.findById.mockResolvedValue(null);
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      BoardCellNotFoundError,
    );
  });

  it('rejects when another selection is already in progress', async () => {
    const { uc, cells } = build();
    cells.findActiveByRoomId.mockResolvedValue(
      makeBoardCell({ id: 'other-cell', state: 'SELECTED' }),
    );
    await expect(uc.execute(input)).rejects.toBeInstanceOf(
      CellSelectionInProgressError,
    );
  });
});

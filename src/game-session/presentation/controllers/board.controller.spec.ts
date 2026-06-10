import { BoardQueryService } from '../../../gameplay/application/queries';
import { LobbyQueryService } from '../../application/queries';
import { SelectQuestionUseCase } from '../../application/use-cases';
import {
  makeBoardCell,
  makeCategory,
  makePlayer,
  makeRoom,
} from '../../application/use-cases/lobby-test-doubles';
import { BoardController } from './board.controller';

describe('BoardController', () => {
  const build = () => {
    const boardQuery = {
      getBoard: jest.fn(),
      listCategories: jest.fn(),
      listCells: jest.fn(),
      getActiveCell: jest.fn(),
    } as unknown as jest.Mocked<BoardQueryService>;
    const lobby = {
      getRoom: jest.fn().mockResolvedValue(makeRoom({ id: 'room-1' })),
    } as unknown as jest.Mocked<LobbyQueryService>;
    const selectQuestion = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SelectQuestionUseCase>;
    const controller = new BoardController(boardQuery, lobby, selectQuestion);
    return { controller, boardQuery, lobby, selectQuestion };
  };

  it('returns the full board for the resolved room', async () => {
    const { controller, boardQuery, lobby } = build();
    boardQuery.getBoard.mockResolvedValue({
      categories: [makeCategory()],
      cells: [makeBoardCell()],
    });
    const res = await controller.getBoard('ABCDEF');
    expect(lobby.getRoom).toHaveBeenCalledWith('ABCDEF');
    expect(boardQuery.getBoard).toHaveBeenCalledWith('room-1');
    expect(res.categories).toHaveLength(1);
    expect(res.cells).toHaveLength(1);
  });

  it('lists the cells and the active cell (or null)', async () => {
    const { controller, boardQuery } = build();
    boardQuery.listCells.mockResolvedValue([makeBoardCell({ id: 'cell-1' })]);
    boardQuery.getActiveCell.mockResolvedValue(
      makeBoardCell({ id: 'cell-1', state: 'SELECTED' }),
    );
    expect((await controller.getCells('ABCDEF'))[0].id).toBe('cell-1');
    expect((await controller.getActiveCell('ABCDEF'))?.state).toBe('SELECTED');

    boardQuery.getActiveCell.mockResolvedValue(null);
    expect(await controller.getActiveCell('ABCDEF')).toBeNull();
  });

  it('selects a cell for the acting player', async () => {
    const { controller, selectQuestion } = build();
    selectQuestion.execute.mockResolvedValue(
      makeBoardCell({ id: 'cell-1', state: 'SELECTED' }),
    );
    const player = makePlayer({ id: 'p1', roomId: 'room-1' });
    const res = await controller.select(player, { cellId: 'cell-1' });
    expect(selectQuestion.execute).toHaveBeenCalledWith({
      roomId: 'room-1',
      actingPlayerId: 'p1',
      cellId: 'cell-1',
    });
    expect(res.state).toBe('SELECTED');
  });
});

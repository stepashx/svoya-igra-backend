import {
  CellAlreadyBlockedError,
  CellNotAvailableError,
  InvalidBoardCellTransitionError,
} from '../errors';
import { BoardCell, BoardCellCreateProps } from './board-cell';

describe('BoardCell', () => {
  const createProps: BoardCellCreateProps = {
    id: 'cell-1',
    roomId: 'room-1',
    questionId: 'question-1',
    categoryId: 'category-1',
    points: 200,
    position: 1,
  };
  const blockedAt = new Date('2026-01-01T00:00:00.000Z');

  const fresh = (): BoardCell => BoardCell.create(createProps);

  it('creates an AVAILABLE cell with no actors and no block stamp', () => {
    const cell = fresh();
    expect(cell.state).toBe('AVAILABLE');
    expect(cell.openedByTeamId).toBeNull();
    expect(cell.answeredByTeamId).toBeNull();
    expect(cell.blockedAt).toBeNull();
    expect(cell.points).toBe(200);
    expect(cell.position).toBe(1);
    expect(cell.questionId).toBe('question-1');
    expect(cell.categoryId).toBe('category-1');
  });

  it('walks the legal lifecycle: select → open → block', () => {
    const cell = fresh();
    cell.select();
    expect(cell.state).toBe('SELECTED');
    cell.open('team-1');
    expect(cell.state).toBe('OPENED');
    expect(cell.openedByTeamId).toBe('team-1');
    cell.block(blockedAt, 'team-1');
    expect(cell.state).toBe('BLOCKED');
    expect(cell.blockedAt).toBe(blockedAt);
    expect(cell.answeredByTeamId).toBe('team-1');
  });

  it('blocks with a null answerer when no team answered correctly', () => {
    const cell = fresh();
    cell.select();
    cell.open('team-1');
    cell.block(blockedAt, null);
    expect(cell.state).toBe('BLOCKED');
    expect(cell.blockedAt).toBe(blockedAt);
    expect(cell.answeredByTeamId).toBeNull();
  });

  it('rejects selecting a cell that is not AVAILABLE', () => {
    const cell = fresh();
    cell.select();
    expect(() => cell.select()).toThrow(CellNotAvailableError);
    expect(cell.state).toBe('SELECTED');
  });

  it('rejects opening a cell that is not SELECTED', () => {
    const cell = fresh();
    expect(() => cell.open('team-1')).toThrow(InvalidBoardCellTransitionError);
    expect(cell.state).toBe('AVAILABLE');
    expect(cell.openedByTeamId).toBeNull();
  });

  it('rejects blocking a cell that was never opened (not OPENED)', () => {
    const cell = fresh();
    cell.select();
    expect(() => cell.block(blockedAt, 'team-1')).toThrow(
      InvalidBoardCellTransitionError,
    );
    expect(cell.state).toBe('SELECTED');
    expect(cell.blockedAt).toBeNull();
  });

  it('rejects blocking a cell that is already BLOCKED', () => {
    const cell = fresh();
    cell.select();
    cell.open('team-1');
    cell.block(blockedAt, 'team-1');
    expect(() => cell.block(blockedAt, 'team-2')).toThrow(
      CellAlreadyBlockedError,
    );
    // The original block stamp/answerer are untouched.
    expect(cell.answeredByTeamId).toBe('team-1');
  });

  it('round-trips through reconstitute', () => {
    const cell = BoardCell.reconstitute({
      id: 'cell-9',
      roomId: 'room-9',
      questionId: 'question-9',
      categoryId: 'category-9',
      points: 800,
      position: 4,
      state: 'OPENED',
      openedByTeamId: 'team-7',
      answeredByTeamId: null,
      blockedAt: null,
    });
    expect(cell.id).toBe('cell-9');
    expect(cell.roomId).toBe('room-9');
    expect(cell.state).toBe('OPENED');
    expect(cell.openedByTeamId).toBe('team-7');
    expect(cell.answeredByTeamId).toBeNull();
    expect(cell.blockedAt).toBeNull();
    expect(cell.points).toBe(800);
    expect(cell.position).toBe(4);
  });
});

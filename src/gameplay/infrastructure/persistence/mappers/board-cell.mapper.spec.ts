import { boardCells } from '../../../../infrastructure/database/schema';
import {
  mapBoardCellToInsert,
  mapBoardCellToUpdate,
  mapRowToBoardCell,
} from './board-cell.mapper';

describe('board-cell.mapper', () => {
  const availableRow: typeof boardCells.$inferSelect = {
    id: 'cell-1',
    roomId: 'room-1',
    questionId: 'question-1',
    categoryId: 'category-1',
    points: 100,
    position: 0,
    state: 'AVAILABLE',
    openedByTeamId: null,
    answeredByTeamId: null,
    blockedAt: null,
  };

  it('round-trips a fresh row through the entity back to an insert (null actors pass through)', () => {
    const cell = mapRowToBoardCell(availableRow);
    expect(cell.state).toBe('AVAILABLE');
    expect(cell.openedByTeamId).toBeNull();
    expect(cell.answeredByTeamId).toBeNull();
    expect(cell.blockedAt).toBeNull();

    expect(mapBoardCellToInsert(cell)).toEqual(availableRow);
  });

  it('passes a non-default state and its actor/timestamp links through both ways', () => {
    const blockedAt = new Date('2026-01-01T00:00:00.000Z');
    const blockedRow: typeof boardCells.$inferSelect = {
      ...availableRow,
      state: 'BLOCKED',
      openedByTeamId: 'team-1',
      answeredByTeamId: 'team-2',
      blockedAt,
    };
    const cell = mapRowToBoardCell(blockedRow);
    expect(cell.state).toBe('BLOCKED');
    expect(cell.openedByTeamId).toBe('team-1');
    expect(cell.answeredByTeamId).toBe('team-2');
    expect(cell.blockedAt).toBe(blockedAt);

    expect(mapBoardCellToInsert(cell)).toEqual(blockedRow);
  });

  it('maps only the mutable lifecycle columns to an update payload', () => {
    const blockedAt = new Date('2026-01-01T00:00:00.000Z');
    const cell = mapRowToBoardCell({
      ...availableRow,
      state: 'OPENED',
      openedByTeamId: 'team-1',
      blockedAt,
    });
    const update = mapBoardCellToUpdate(cell);
    expect(update).toEqual({
      state: 'OPENED',
      openedByTeamId: 'team-1',
      answeredByTeamId: null,
      blockedAt,
    });
    expect(update).not.toHaveProperty('id');
    expect(update).not.toHaveProperty('roomId');
    expect(update).not.toHaveProperty('questionId');
    expect(update).not.toHaveProperty('categoryId');
    expect(update).not.toHaveProperty('points');
    expect(update).not.toHaveProperty('position');
  });
});

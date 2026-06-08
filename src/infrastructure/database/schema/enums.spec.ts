import {
  BOARD_CELL_STATES,
  CONNECTION_STATUSES,
  EVALUATOR_TYPES,
  GAME_STAGES,
  QR_FILE_FORMATS,
  ROOM_STATUSES,
  SUBMISSION_STATUSES,
} from './index';

/**
 * Enum guard: each string-union array equals its expected list (values and
 * length). These arrays are the single source of truth for the `text(..., {
 * enum })` columns, so a drift here is a schema change.
 */
describe('schema enums', () => {
  it('GameStage covers the 12 plan §13 stages in order', () => {
    expect(GAME_STAGES).toEqual([
      'LOBBY',
      'TEAM_SETUP',
      'READY_CHECK',
      'GAME_BOARD',
      'QUESTION_OPENED',
      'ANSWER_REVIEW',
      'SHOP',
      'PRESENTATION_PREPARATION',
      'PRESENTATION_DEFENSE',
      'EVALUATION',
      'RESULTS',
      'FINISHED',
    ]);
    expect(GAME_STAGES).toHaveLength(12);
  });

  it('BoardCellState has the 4 states', () => {
    expect(BOARD_CELL_STATES).toEqual([
      'AVAILABLE',
      'SELECTED',
      'OPENED',
      'BLOCKED',
    ]);
    expect(BOARD_CELL_STATES).toHaveLength(4);
  });

  it('EvaluatorType is TEAM/HOST', () => {
    expect(EVALUATOR_TYPES).toEqual(['TEAM', 'HOST']);
    expect(EVALUATOR_TYPES).toHaveLength(2);
  });

  it('QrFileFormat is SVG only', () => {
    expect(QR_FILE_FORMATS).toEqual(['SVG']);
    expect(QR_FILE_FORMATS).toHaveLength(1);
  });

  it('RoomStatus is ACTIVE/FINISHED/CLOSED', () => {
    expect(ROOM_STATUSES).toEqual(['ACTIVE', 'FINISHED', 'CLOSED']);
    expect(ROOM_STATUSES).toHaveLength(3);
  });

  it('ConnectionStatus is CONNECTED/DISCONNECTED', () => {
    expect(CONNECTION_STATUSES).toEqual(['CONNECTED', 'DISCONNECTED']);
    expect(CONNECTION_STATUSES).toHaveLength(2);
  });

  it('SubmissionStatus is UPLOADED/LATE', () => {
    expect(SUBMISSION_STATUSES).toEqual(['UPLOADED', 'LATE']);
    expect(SUBMISSION_STATUSES).toHaveLength(2);
  });
});

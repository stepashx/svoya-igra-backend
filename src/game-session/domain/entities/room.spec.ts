import {
  InvalidQuestionCountsError,
  InvalidStageTransitionError,
  RoomNotActiveError,
} from '../errors';
import { GameStage } from '../types';
import { ReconnectToken, RoomCode } from '../value-objects';
import { Room } from './room';

describe('Room', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  const makeRoom = (): Room =>
    Room.create(
      {
        id: 'room-1',
        code: RoomCode.create('ABCDE'),
        hostId: 'host-1',
        hostReconnectToken: ReconnectToken.create('host-token'),
      },
      now,
    );

  /** Rehydrate a room parked at an arbitrary stage (for transition tests). */
  const makeRoomAt = (currentStage: GameStage): Room =>
    Room.reconstitute({
      id: 'room-1',
      code: RoomCode.create('ABCDE'),
      status: 'ACTIVE',
      currentStage,
      hostId: 'host-1',
      hostReconnectToken: ReconnectToken.create('host-token'),
      currentTeamId: null,
      totalQuestionsCount: 30,
      blockedQuestionsCount: 0,
      currentShopRound: 0,
      createdAt: now,
      finishedAt: null,
    });

  it('creates an ACTIVE room in the LOBBY stage with a full board', () => {
    const room = makeRoom();
    expect(room.status).toBe('ACTIVE');
    expect(room.currentStage).toBe('LOBBY');
    expect(room.currentTeamId).toBeNull();
    expect(room.totalQuestionsCount).toBe(30);
    expect(room.blockedQuestionsCount).toBe(0);
    expect(room.currentShopRound).toBe(0);
    expect(room.createdAt).toBe(now);
    expect(room.finishedAt).toBeNull();
  });

  it('walks the legal lobby stage path', () => {
    const room = makeRoom();
    room.transitionTo('TEAM_SETUP');
    room.transitionTo('READY_CHECK');
    room.transitionTo('GAME_BOARD');
    expect(room.currentStage).toBe('GAME_BOARD');
  });

  it('rejects an illegal stage transition and keeps the stage', () => {
    const room = makeRoom();
    expect(() => room.transitionTo('GAME_BOARD')).toThrow(
      InvalidStageTransitionError,
    );
    expect(room.currentStage).toBe('LOBBY');
  });

  it('walks the legal board-loop transitions', () => {
    const legal: ReadonlyArray<[GameStage, GameStage]> = [
      ['GAME_BOARD', 'QUESTION_OPENED'],
      ['QUESTION_OPENED', 'ANSWER_REVIEW'],
      ['ANSWER_REVIEW', 'GAME_BOARD'],
      ['ANSWER_REVIEW', 'SHOP'],
      ['SHOP', 'GAME_BOARD'],
    ];
    for (const [from, to] of legal) {
      const room = makeRoomAt(from);
      room.transitionTo(to);
      expect(room.currentStage).toBe(to);
    }
  });

  it('rejects illegal board-loop transitions and keeps the stage', () => {
    const illegal: ReadonlyArray<[GameStage, GameStage]> = [
      ['GAME_BOARD', 'SHOP'],
      ['GAME_BOARD', 'ANSWER_REVIEW'],
      ['QUESTION_OPENED', 'GAME_BOARD'],
      ['ANSWER_REVIEW', 'QUESTION_OPENED'],
      ['SHOP', 'QUESTION_OPENED'],
    ];
    for (const [from, to] of illegal) {
      const room = makeRoomAt(from);
      expect(() => room.transitionTo(to)).toThrow(InvalidStageTransitionError);
      expect(room.currentStage).toBe(from);
    }
  });

  it('assigns the current team', () => {
    const room = makeRoom();
    room.assignCurrentTeam('team-7');
    expect(room.currentTeamId).toBe('team-7');
  });

  it('closes the room (CLOSED + finishedAt)', () => {
    const room = makeRoom();
    const closedAt = new Date('2026-01-01T01:00:00.000Z');
    room.close(closedAt);
    expect(room.status).toBe('CLOSED');
    expect(room.finishedAt).toBe(closedAt);
  });

  it('marks the room finished (FINISHED + finishedAt)', () => {
    const room = makeRoom();
    const finishedAt = new Date('2026-01-01T02:00:00.000Z');
    room.markFinished(finishedAt);
    expect(room.status).toBe('FINISHED');
    expect(room.finishedAt).toBe(finishedAt);
  });

  it('rejects closing a room that is not ACTIVE', () => {
    const room = makeRoom();
    room.close(new Date('2026-01-01T01:00:00.000Z'));
    expect(() => room.close(new Date('2026-01-01T01:30:00.000Z'))).toThrow(
      RoomNotActiveError,
    );
    expect(() =>
      room.markFinished(new Date('2026-01-01T01:30:00.000Z')),
    ).toThrow(RoomNotActiveError);
  });

  it('rejects finishing a room that is not ACTIVE', () => {
    const room = makeRoom();
    room.markFinished(new Date('2026-01-01T02:00:00.000Z'));
    expect(() =>
      room.markFinished(new Date('2026-01-01T02:30:00.000Z')),
    ).toThrow(RoomNotActiveError);
    expect(() => room.close(new Date('2026-01-01T02:30:00.000Z'))).toThrow(
      RoomNotActiveError,
    );
  });

  it('increments the blocked-questions count after an answer review', () => {
    const room = makeRoomAt('ANSWER_REVIEW');
    expect(room.blockedQuestionsCount).toBe(0);
    room.incrementBlockedQuestions();
    room.incrementBlockedQuestions();
    expect(room.blockedQuestionsCount).toBe(2);
  });

  it('rejects incrementing the blocked count past the board size', () => {
    const room = Room.reconstitute({
      id: 'room-1',
      code: RoomCode.create('ABCDE'),
      status: 'ACTIVE',
      currentStage: 'GAME_BOARD',
      hostId: 'host-1',
      hostReconnectToken: ReconnectToken.create('host-token'),
      currentTeamId: null,
      totalQuestionsCount: 30,
      blockedQuestionsCount: 30,
      currentShopRound: 0,
      createdAt: now,
      finishedAt: null,
    });
    expect(() => room.incrementBlockedQuestions()).toThrow(
      InvalidQuestionCountsError,
    );
    expect(room.blockedQuestionsCount).toBe(30);
  });

  it('enforces blockedQuestionsCount <= totalQuestionsCount', () => {
    expect(() =>
      Room.reconstitute({
        id: 'room-1',
        code: RoomCode.create('ABCDE'),
        status: 'ACTIVE',
        currentStage: 'LOBBY',
        hostId: 'host-1',
        hostReconnectToken: ReconnectToken.create('host-token'),
        currentTeamId: null,
        totalQuestionsCount: 30,
        blockedQuestionsCount: 31,
        currentShopRound: 0,
        createdAt: now,
        finishedAt: null,
      }),
    ).toThrow(InvalidQuestionCountsError);
  });
});

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
  const makeRoomAt = (
    currentStage: GameStage,
    blockedQuestionsCount = 0,
  ): Room =>
    Room.reconstitute({
      id: 'room-1',
      code: RoomCode.create('ABCDE'),
      status: 'ACTIVE',
      currentStage,
      hostId: 'host-1',
      hostReconnectToken: ReconnectToken.create('host-token'),
      currentTeamId: null,
      totalQuestionsCount: 30,
      blockedQuestionsCount,
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
      ['SHOP', 'PRESENTATION_PREPARATION'],
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

  describe('enterShop (§14.8)', () => {
    it('enters the shop from ANSWER_REVIEW and counts the round', () => {
      const room = makeRoomAt('ANSWER_REVIEW');
      room.enterShop();
      expect(room.currentStage).toBe('SHOP');
      expect(room.currentShopRound).toBe(1);
    });

    it('accumulates the round across two board loops', () => {
      const room = makeRoomAt('ANSWER_REVIEW');
      room.enterShop();
      room.transitionTo('GAME_BOARD');
      room.transitionTo('QUESTION_OPENED');
      room.transitionTo('ANSWER_REVIEW');
      room.enterShop();
      expect(room.currentStage).toBe('SHOP');
      expect(room.currentShopRound).toBe(2);
    });

    it.each<GameStage>(['LOBBY', 'GAME_BOARD', 'QUESTION_OPENED', 'SHOP'])(
      'rejects entering the shop from %s and keeps the round count',
      (stage) => {
        const room = makeRoomAt(stage);
        expect(() => room.enterShop()).toThrow(InvalidStageTransitionError);
        expect(room.currentStage).toBe(stage);
        expect(room.currentShopRound).toBe(0);
      },
    );
  });

  describe('exitShop / finalizeShop (8.2)', () => {
    it('exitShop leaves the shop for GAME_BOARD', () => {
      const room = makeRoomAt('SHOP');
      room.exitShop();
      expect(room.currentStage).toBe('GAME_BOARD');
    });

    it('finalizeShop leaves the shop for PRESENTATION_PREPARATION', () => {
      const room = makeRoomAt('SHOP');
      room.finalizeShop();
      expect(room.currentStage).toBe('PRESENTATION_PREPARATION');
    });

    it.each<GameStage>(['LOBBY', 'GAME_BOARD', 'QUESTION_OPENED'])(
      'rejects exitShop outside SHOP (from %s) and keeps the stage',
      (stage) => {
        const room = makeRoomAt(stage);
        expect(() => room.exitShop()).toThrow(InvalidStageTransitionError);
        expect(room.currentStage).toBe(stage);
      },
    );

    it.each<GameStage>(['LOBBY', 'GAME_BOARD', 'ANSWER_REVIEW'])(
      'rejects finalizeShop outside SHOP (from %s) and keeps the stage',
      (stage) => {
        const room = makeRoomAt(stage);
        expect(() => room.finalizeShop()).toThrow(InvalidStageTransitionError);
        expect(room.currentStage).toBe(stage);
      },
    );
  });

  describe('isBoardExhausted (8.2)', () => {
    it('is false while any cell remains unblocked (29/30)', () => {
      expect(makeRoomAt('SHOP', 29).isBoardExhausted).toBe(false);
    });

    it('is true once every cell is blocked (30/30)', () => {
      expect(makeRoomAt('SHOP', 30).isBoardExhausted).toBe(true);
    });
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

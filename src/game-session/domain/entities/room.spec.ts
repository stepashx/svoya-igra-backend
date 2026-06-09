import {
  InvalidQuestionCountsError,
  InvalidStageTransitionError,
} from '../errors';
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

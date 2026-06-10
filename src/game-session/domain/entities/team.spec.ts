import { CaptainAlreadyAssignedError, InvalidScoreError } from '../errors';
import { Score, TeamName } from '../value-objects';
import { Team } from './team';

describe('Team', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');

  const makeTeam = (): Team =>
    Team.create(
      { id: 'team-1', roomId: 'room-1', name: TeamName.create('Red') },
      createdAt,
    );

  it('creates a team with no captain, no topic, not ready, zero scores', () => {
    const team = makeTeam();
    expect(team.captainPlayerId).toBeNull();
    expect(team.selectedTopicId).toBeNull();
    expect(team.isReady).toBe(false);
    expect(team.turnOrder).toBeNull();
    expect(team.earnedScore.value).toBe(0);
    expect(team.balance.value).toBe(0);
    expect(team.createdAt).toBe(createdAt);
  });

  it('assigns a captain once and rejects re-assignment', () => {
    const team = makeTeam();
    team.assignCaptain('player-1');
    expect(team.captainPlayerId).toBe('player-1');
    expect(() => team.assignCaptain('player-2')).toThrow(
      CaptainAlreadyAssignedError,
    );
    expect(team.captainPlayerId).toBe('player-1');
  });

  it('selects and clears a topic', () => {
    const team = makeTeam();
    team.selectTopic('topic-1');
    expect(team.selectedTopicId).toBe('topic-1');
    team.clearTopic();
    expect(team.selectedTopicId).toBeNull();
  });

  it('toggles readiness', () => {
    const team = makeTeam();
    team.markReady();
    expect(team.isReady).toBe(true);
    team.markNotReady();
    expect(team.isReady).toBe(false);
  });

  it('assigns and clears turn order', () => {
    const team = makeTeam();
    team.assignTurnOrder(2);
    expect(team.turnOrder).toBe(2);
    team.assignTurnOrder(null);
    expect(team.turnOrder).toBeNull();
  });

  describe('awardPoints (§14.7 scoring)', () => {
    /** A team rehydrated with diverged scores (earnedScore ≠ balance). */
    const reconstituteTeam = (earnedScore: number, balance: number): Team =>
      Team.reconstitute({
        id: 'team-1',
        roomId: 'room-1',
        name: TeamName.create('Red'),
        captainPlayerId: null,
        selectedTopicId: null,
        isReady: false,
        turnOrder: null,
        earnedScore: Score.create(earnedScore),
        balance: Score.create(balance),
        presentationSubmissionId: null,
        createdAt,
      });

    it('grows earnedScore AND balance together', () => {
      const team = makeTeam();
      team.awardPoints(300);
      expect(team.earnedScore.value).toBe(300);
      expect(team.balance.value).toBe(300);
    });

    it('accumulates across consecutive awards', () => {
      const team = makeTeam();
      team.awardPoints(300);
      team.awardPoints(200);
      expect(team.earnedScore.value).toBe(500);
      expect(team.balance.value).toBe(500);
    });

    it('adds to each score independently when they diverged', () => {
      const team = reconstituteTeam(200, 100);
      team.awardPoints(50);
      expect(team.earnedScore.value).toBe(250);
      expect(team.balance.value).toBe(150);
    });

    it.each([0, -100, 1.5])(
      'rejects %p and leaves both scores untouched',
      (points) => {
        const team = makeTeam();
        expect(() => team.awardPoints(points)).toThrow(InvalidScoreError);
        expect(team.earnedScore.value).toBe(0);
        expect(team.balance.value).toBe(0);
      },
    );
  });
});

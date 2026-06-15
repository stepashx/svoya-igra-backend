import {
  CaptainAlreadyAssignedError,
  InsufficientBalanceError,
  InvalidScoreError,
} from '../errors';
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

  describe('debitBalance / canAfford (§14.7 purchases)', () => {
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

    it('debits ONLY balance — earnedScore stays frozen', () => {
      const team = reconstituteTeam(500, 500);
      team.debitBalance(300);
      expect(team.balance.value).toBe(200);
      expect(team.earnedScore.value).toBe(500);
    });

    it('debits the balance independently when the scores diverged', () => {
      const team = reconstituteTeam(700, 400);
      team.debitBalance(100);
      expect(team.balance.value).toBe(300);
      expect(team.earnedScore.value).toBe(700);
    });

    it('allows spending the whole balance (boundary: balance == price)', () => {
      const team = reconstituteTeam(300, 300);
      team.debitBalance(300);
      expect(team.balance.value).toBe(0);
      expect(team.earnedScore.value).toBe(300);
    });

    it('rejects a price above the balance and leaves both scores untouched', () => {
      const team = reconstituteTeam(500, 200);
      expect(() => team.debitBalance(201)).toThrow(InsufficientBalanceError);
      expect(team.balance.value).toBe(200);
      expect(team.earnedScore.value).toBe(500);
    });

    it.each([0, -100, 1.5])(
      'rejects price %p and leaves both scores untouched',
      (price) => {
        const team = reconstituteTeam(500, 200);
        expect(() => team.debitBalance(price)).toThrow(InvalidScoreError);
        expect(team.balance.value).toBe(200);
        expect(team.earnedScore.value).toBe(500);
      },
    );

    it('canAfford compares the price against balance only (boundaries included)', () => {
      const team = reconstituteTeam(500, 200);
      expect(team.canAfford(199)).toBe(true);
      expect(team.canAfford(200)).toBe(true);
      expect(team.canAfford(201)).toBe(false);
      expect(team.canAfford(500)).toBe(false);
    });
  });

  describe('attachSubmission (§9.3 presentation link)', () => {
    it('sets the presentation submission id', () => {
      const team = makeTeam();
      expect(team.presentationSubmissionId).toBeNull();
      team.attachSubmission('sub-1');
      expect(team.presentationSubmissionId).toBe('sub-1');
    });

    it('plainly OVERWRITES on a re-upload (no assign-once guard)', () => {
      const team = makeTeam();
      team.attachSubmission('sub-1');
      // A replace reuses the same id; even a different id just overwrites.
      expect(() => team.attachSubmission('sub-2')).not.toThrow();
      expect(team.presentationSubmissionId).toBe('sub-2');
    });
  });
});

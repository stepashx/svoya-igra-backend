import {
  EvaluationAlreadyConfirmedError,
  InvalidEvaluatorError,
} from '../errors';
import { EvaluationScore } from './evaluation-score';

describe('EvaluationScore', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  const teamProps = {
    id: 'score-1',
    roomId: 'room-1',
    targetTeamId: 'team-target',
    evaluatorType: 'TEAM' as const,
    evaluatorTeamId: 'team-evaluator',
    hostId: null,
    topicScore: 7,
    designScore: 5,
  };

  const hostProps = {
    id: 'score-2',
    roomId: 'room-1',
    targetTeamId: 'team-target',
    evaluatorType: 'HOST' as const,
    evaluatorTeamId: null,
    hostId: 'host-1',
    topicScore: 8,
    designScore: 6,
  };

  describe('create', () => {
    it('derives total = topic + design and weight 1 for a TEAM score', () => {
      const score = EvaluationScore.create(teamProps);
      expect(score.totalScore).toBe(12);
      expect(score.weight).toBe(1);
      expect(score.evaluatorType).toBe('TEAM');
      expect(score.evaluatorTeamId).toBe('team-evaluator');
      expect(score.hostId).toBeNull();
      expect(score.confirmedAt).toBeNull();
    });

    it('derives weight 2 for a HOST score (team-id null, host-id set)', () => {
      const score = EvaluationScore.create(hostProps);
      expect(score.totalScore).toBe(14);
      expect(score.weight).toBe(2);
      expect(score.evaluatorTeamId).toBeNull();
      expect(score.hostId).toBe('host-1');
      expect(score.confirmedAt).toBeNull();
    });

    it('rejects a TEAM score without an evaluatorTeamId', () => {
      expect(() =>
        EvaluationScore.create({ ...teamProps, evaluatorTeamId: null }),
      ).toThrow(InvalidEvaluatorError);
    });

    it('rejects a TEAM score that also carries a hostId', () => {
      expect(() =>
        EvaluationScore.create({ ...teamProps, hostId: 'host-1' }),
      ).toThrow(InvalidEvaluatorError);
    });

    it('rejects a HOST score without a hostId', () => {
      expect(() =>
        EvaluationScore.create({ ...hostProps, hostId: null }),
      ).toThrow(InvalidEvaluatorError);
    });

    it('rejects a HOST score that also carries an evaluatorTeamId', () => {
      expect(() =>
        EvaluationScore.create({ ...hostProps, evaluatorTeamId: 'team-x' }),
      ).toThrow(InvalidEvaluatorError);
    });

    it('backstops self-evaluation: a TEAM whose evaluator equals its target', () => {
      expect(() =>
        EvaluationScore.create({
          ...teamProps,
          evaluatorTeamId: 'team-target',
        }),
      ).toThrow(InvalidEvaluatorError);
    });
  });

  describe('confirm', () => {
    it('returns a NEW confirmed instance and leaves the original untouched', () => {
      const draft = EvaluationScore.create(teamProps);
      const confirmed = draft.confirm(now);

      expect(confirmed).not.toBe(draft);
      expect(confirmed.confirmedAt).toBe(now);
      // The original draft is unchanged (Variant A immutability).
      expect(draft.confirmedAt).toBeNull();
      // Every other field is carried over.
      expect(confirmed.id).toBe(draft.id);
      expect(confirmed.totalScore).toBe(draft.totalScore);
      expect(confirmed.weight).toBe(draft.weight);
    });

    it('rejects confirming an already-confirmed score', () => {
      const confirmed = EvaluationScore.create(teamProps).confirm(now);
      expect(() => confirmed.confirm(now)).toThrow(
        EvaluationAlreadyConfirmedError,
      );
    });
  });

  describe('reconstitute', () => {
    it('rehydrates persisted state round-trip without re-deriving', () => {
      const confirmedAt = new Date('2026-06-15T12:30:00.000Z');
      const score = EvaluationScore.reconstitute({
        id: 'score-3',
        roomId: 'room-1',
        targetTeamId: 'team-target',
        evaluatorType: 'HOST',
        evaluatorTeamId: null,
        hostId: 'host-1',
        topicScore: 3,
        designScore: 4,
        // A deliberately inconsistent total/weight proves reconstitute does NOT
        // re-derive — it trusts the persisted row verbatim.
        totalScore: 99,
        weight: 5,
        confirmedAt,
      });
      expect(score.totalScore).toBe(99);
      expect(score.weight).toBe(5);
      expect(score.confirmedAt).toBe(confirmedAt);
      expect(score.hostId).toBe('host-1');
    });
  });
});

import { FinalResult } from './final-result';

describe('FinalResult', () => {
  const NOW = new Date('2026-06-16T12:00:00.000Z');

  const baseProps = {
    id: 'fr-1',
    roomId: 'room-1',
    teamId: 'team-1',
    earnedScore: 100,
    presentationScoreRaw: 8,
    latePenalty: 0,
    place: 1,
  };

  describe('deriveScores', () => {
    it('subtracts the penalty then multiplies by the earned score', () => {
      // presentationScoreFinal = max(0, 8 − 1) = 7; finalScore = 100 × 7 = 700.
      expect(FinalResult.deriveScores(8, 1, 100)).toEqual({
        presentationScoreFinal: 7,
        finalScore: 700,
      });
    });

    it('clamps the presentation score at zero (penalty cannot go negative)', () => {
      // raw 2 − penalty 5 = −3 → clamped to 0; finalScore = 50 × 0 = 0.
      expect(FinalResult.deriveScores(2, 5, 50)).toEqual({
        presentationScoreFinal: 0,
        finalScore: 0,
      });
    });

    it('⚠️G B3-pin: a zero presentation score collapses the final score (floor=0)', () => {
      // earned 300, raw 2, penalty 2 → presentationScoreFinal 0 → finalScore 0.
      // The presentation is a MULTIPLICATIVE gate: it erases the quiz score.
      expect(FinalResult.deriveScores(2, 2, 300)).toEqual({
        presentationScoreFinal: 0,
        finalScore: 0,
      });
    });

    it('preserves a fractional raw double (no rounding)', () => {
      const { presentationScoreFinal, finalScore } = FinalResult.deriveScores(
        23 / 3,
        0,
        3,
      );
      expect(presentationScoreFinal).toBeCloseTo(7.6666666, 6);
      expect(finalScore).toBeCloseTo(23, 9);
    });
  });

  describe('create', () => {
    it('derives presentationScoreFinal/finalScore and stamps calculatedAt', () => {
      const result = FinalResult.create(
        { ...baseProps, presentationScoreRaw: 8, latePenalty: 1 },
        NOW,
      );
      expect(result.presentationScoreFinal).toBe(7);
      expect(result.finalScore).toBe(700);
      expect(result.calculatedAt).toBe(NOW);
    });

    it('keeps the cross-team place as supplied (not derived)', () => {
      const result = FinalResult.create({ ...baseProps, place: 3 }, NOW);
      expect(result.place).toBe(3);
    });

    it('stores the raw inputs verbatim (earnedScore, presentationScoreRaw, latePenalty)', () => {
      const result = FinalResult.create(
        {
          ...baseProps,
          earnedScore: 100,
          presentationScoreRaw: 8,
          latePenalty: 2,
        },
        NOW,
      );
      expect(result.earnedScore).toBe(100);
      expect(result.presentationScoreRaw).toBe(8);
      expect(result.latePenalty).toBe(2);
    });

    it('anti-drift: create-stored scores equal a direct deriveScores call', () => {
      const props = {
        ...baseProps,
        earnedScore: 42,
        presentationScoreRaw: 6.5,
        latePenalty: 1.5,
      };
      const direct = FinalResult.deriveScores(
        props.presentationScoreRaw,
        props.latePenalty,
        props.earnedScore,
      );
      const result = FinalResult.create(props, NOW);
      expect(result.presentationScoreFinal).toBe(direct.presentationScoreFinal);
      expect(result.finalScore).toBe(direct.finalScore);
    });
  });

  describe('reconstitute', () => {
    it('passes every field through without recomputing', () => {
      // Deliberately INCONSISTENT derived values to prove no recomputation.
      const result = FinalResult.reconstitute({
        id: 'fr-9',
        roomId: 'room-9',
        teamId: 'team-9',
        earnedScore: 100,
        presentationScoreRaw: 8,
        latePenalty: 1,
        presentationScoreFinal: 999, // would be 7 if recomputed
        finalScore: 12345, // would be 700 if recomputed
        place: 4,
        calculatedAt: NOW,
      });
      expect(result.presentationScoreFinal).toBe(999);
      expect(result.finalScore).toBe(12345);
      expect(result.place).toBe(4);
      expect(result.calculatedAt).toBe(NOW);
    });
  });
});

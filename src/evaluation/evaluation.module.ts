import { Module } from '@nestjs/common';

/**
 * Evaluation feature area — placeholder shell only (Stage 3A).
 *
 * Later: criteria, weighted team/host scoring (team 1, host 2),
 * presentationScoreRaw/Final, finalScore, places, and tie-break. Reads
 * earnedScore but never owns it. No logic exists yet.
 */
@Module({})
export class EvaluationModule {}

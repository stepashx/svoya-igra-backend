import { ApiProperty } from '@nestjs/swagger';

/**
 * One team's row on the final leaderboard (plan §14.10, §15.11). PUBLIC
 * AGGREGATES only — the individual `evaluation_scores` stay private (§16.8): this
 * reveals the computed result, never who scored whom what. `earnedScore`/`place`
 * are integers; the three presentation/final fields are fractional doubles.
 */
export class LeaderboardEntryDto {
  @ApiProperty()
  teamId!: string;

  @ApiProperty()
  teamName!: string;

  @ApiProperty({ description: 'The team’s quiz score snapshot (§14.7).' })
  earnedScore!: number;

  @ApiProperty({
    description: 'Raw weighted-average presentation score Σ(w·s)/Σw.',
  })
  presentationScoreRaw!: number;

  @ApiProperty({ description: 'Effective §9 late penalty (0 when not late).' })
  latePenalty!: number;

  @ApiProperty({ description: 'max(0, raw − penalty).' })
  presentationScoreFinal!: number;

  @ApiProperty({
    description: 'earnedScore × presentationScoreFinal (§14.10).',
  })
  finalScore!: number;

  @ApiProperty({ description: 'Dense 1-based place (ties share a place).' })
  place!: number;
}

/**
 * The final leaderboard (plan §15.11) — entries ordered `(place, teamId)`.
 * Returned by `POST results` (the host's calculation) and `GET results` (the
 * public read; `[]` before results are calculated).
 */
export class ResultsResponseDto {
  @ApiProperty({ type: [LeaderboardEntryDto] })
  leaderboard!: LeaderboardEntryDto[];
}

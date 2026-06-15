import { ApiProperty } from '@nestjs/swagger';

/**
 * The current presentation-defense state (plan §15.7) — the `POST start` reply
 * and the public `GET defense/state` read (reconnect/refresh). The whole state
 * is DERIVED, there is no defense table: `currentPresenterTeamId` is the room's
 * active-team pointer and `order` is the participating teams' `turnOrder`
 * ascending. Public room-wide: the defense order carries no secret.
 */
export class DefenseStateResponseDto {
  @ApiProperty({ example: 'PRESENTATION_DEFENSE' })
  currentStage!: string;

  @ApiProperty({ nullable: true })
  currentPresenterTeamId!: string | null;

  @ApiProperty({
    type: [String],
    description: 'Team ids in defense order (turnOrder ascending).',
  })
  order!: string[];
}

/**
 * The reply to a `POST finish-presenter` / `POST skip-presenter` advance (plan
 * §15.7): who presents next (`null` once the last presenter is done) and whether
 * the defenses just ended — `finished` is `true` exactly when the room moved on
 * to EVALUATION.
 */
export class DefenseAdvanceResponseDto {
  @ApiProperty({ example: 'PRESENTATION_DEFENSE' })
  currentStage!: string;

  @ApiProperty({ nullable: true })
  currentPresenterTeamId!: string | null;

  @ApiProperty({
    description:
      'True once the last presenter finished/skipped — the room moved on to EVALUATION.',
  })
  finished!: boolean;
}

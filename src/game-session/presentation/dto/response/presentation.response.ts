import { ApiProperty } from '@nestjs/swagger';

/**
 * A presentation requirement/condition (plan §15.10) for the `GET requirements`
 * list. PUBLIC (room-wide visible) — the requirements catalog is shown to every
 * participant during preparation; it carries no secret content (the QR-secrecy
 * of §16.5 has no analogue here).
 */
export class PresentationRequirementResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ description: 'Display order (ascending).' })
  order!: number;

  @ApiProperty()
  isRequired!: boolean;
}

/**
 * The presentation-preparation deadline / timer state (9.2). Its OWN DTO (not
 * reused from {@link TimerResponseDto}): the preparation window has no
 * minimum-open fields. The client counts down locally to `endsAt`. PUBLIC
 * (room-wide visible) — there is no secret here.
 */
export class PresentationDeadlineResponseDto {
  @ApiProperty({ enum: ['RUNNING', 'EXPIRED', 'IDLE'] })
  status!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  endsAt!: string | null;

  @ApiProperty()
  remainingMs!: number;
}

/**
 * A team's presentation upload status (plan §15.10) for the `GET submissions`
 * list. PUBLIC (room-wide visible): presentation files are public (Этап2
 * §10.15), so `publicUrl` is NOT a secret here — the deliberate opposite of the
 * §16.5 QR contract. Minimal in 9.2; 9.3 adds the richer file metadata
 * additively (originalFileName / fileSize / latePenalty).
 */
export class PresentationSubmissionStatusResponseDto {
  @ApiProperty()
  teamId!: string;

  @ApiProperty({ enum: ['UPLOADED', 'LATE'] })
  status!: string;

  @ApiProperty()
  isLate!: boolean;

  @ApiProperty({ format: 'date-time' })
  uploadedAt!: string;

  @ApiProperty({ description: 'Public link to the file (no secrecy, §10.15).' })
  publicUrl!: string;
}

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

  @ApiProperty({ description: 'The original client file name.' })
  originalFileName!: string;

  @ApiProperty({ description: 'File size in bytes.' })
  fileSize!: number;

  @ApiProperty({
    description:
      'EFFECTIVE late penalty: the configured value if late, else 0.',
  })
  latePenalty!: number;
}

/**
 * One team's presentation file (plan §15.10) for the public `GET files` list and
 * the room-wide `files-updated` broadcast — the SAME shape on both surfaces, so
 * the frontend renders a WS push and a REST read identically (the DRY file
 * projection). PUBLIC: `publicUrl` is room-readable (§10.15).
 */
export class PresentationFileResponseDto {
  @ApiProperty()
  teamId!: string;

  @ApiProperty()
  originalFileName!: string;

  @ApiProperty({
    description: 'SERVER-canonical MIME (derived from extension).',
  })
  mimeType!: string;

  @ApiProperty({ description: 'File size in bytes.' })
  fileSize!: number;

  @ApiProperty({ description: 'Public link to the file (no secrecy, §10.15).' })
  publicUrl!: string;

  @ApiProperty({ enum: ['UPLOADED', 'LATE'] })
  status!: string;

  @ApiProperty()
  isLate!: boolean;

  @ApiProperty({ format: 'date-time' })
  uploadedAt!: string;
}

/**
 * The reply to a successful `POST`/`PUT upload`, sent to the uploading captain
 * (plan §15.10). Behind the player guard, but PUBLIC anyway (presentation files
 * carry no secret, §10.15). Flat on purpose: the file's stored metadata plus
 * `isCreate` (whether this was a first upload or a replace).
 */
export class PresentationUploadResultResponseDto {
  @ApiProperty({ description: 'true on first upload, false on a replace.' })
  isCreate!: boolean;

  @ApiProperty()
  teamId!: string;

  @ApiProperty()
  originalFileName!: string;

  @ApiProperty({
    description: 'SERVER-canonical MIME (derived from extension).',
  })
  mimeType!: string;

  @ApiProperty({ description: 'File size in bytes.' })
  fileSize!: number;

  @ApiProperty({ enum: ['UPLOADED', 'LATE'] })
  status!: string;

  @ApiProperty()
  isLate!: boolean;

  @ApiProperty({
    description:
      'EFFECTIVE late penalty: the configured value if late, else 0.',
  })
  latePenalty!: number;

  @ApiProperty({ format: 'date-time' })
  uploadedAt!: string;

  @ApiProperty({ description: 'Public link to the stored file (§10.15).' })
  publicUrl!: string;
}

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

import { ApiProperty } from '@nestjs/swagger';

/**
 * A shop catalog item with its per-room availability (plan §15.8). Carries the
 * QR tool's id only — never `publicUrl` or any QR content (§16.5 secrecy: the
 * tool reaches the buying team alone, via the 8.3 inventory surface).
 */
export class ShopItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty()
  price!: number;

  @ApiProperty()
  qrToolId!: string;

  @ApiProperty({
    description: 'False once any team in the room bought the item (§14.8).',
  })
  available!: boolean;
}

/**
 * The shop timer state (8.2). Distinct from {@link TimerResponseDto}: the shop
 * window carries the minimum-open fields — `minClosableAt` (null while IDLE)
 * and the derived `closable` the close button follows. The client counts down
 * locally to `endsAt`.
 */
export class ShopTimerResponseDto {
  @ApiProperty({ enum: ['RUNNING', 'EXPIRED', 'IDLE'] })
  status!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  endsAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  minClosableAt!: string | null;

  @ApiProperty()
  remainingMs!: number;

  @ApiProperty({
    description: 'True unless the timer is RUNNING before minClosableAt.',
  })
  closable!: boolean;
}

/** The current shop round for the GET-round endpoint (plan §15.8). */
export class ShopRoundResponseDto {
  @ApiProperty()
  currentShopRound!: number;

  @ApiProperty({ example: 'SHOP' })
  currentStage!: string;

  @ApiProperty({
    description:
      'True when the board is exhausted — the final shop before presentations.',
  })
  isFinalShop!: boolean;

  @ApiProperty({ type: ShopTimerResponseDto })
  timer!: ShopTimerResponseDto;
}

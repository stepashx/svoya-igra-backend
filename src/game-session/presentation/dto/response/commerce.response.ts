import { ApiProperty } from '@nestjs/swagger';

/**
 * A QR tool a team owns (plan §15.9). Carries the consumer-facing `publicUrl` —
 * allowed ONLY on the team-gated inventory surface and the captain's purchase
 * reply, NEVER in a room-wide payload (§16.5 secrecy).
 */
export class QrToolResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ['SVG'] })
  fileFormat!: string;

  @ApiProperty()
  publicUrl!: string;
}

/**
 * A per-room purchase record (plan §15.8) for the `GET purchases` list. Public
 * (room-wide visible): the price snapshot and the buying team, never the QR
 * tool — that reaches the owning team alone.
 */
export class PurchaseResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  teamId!: string;

  @ApiProperty()
  shopItemId!: string;

  @ApiProperty({ description: 'Price snapshot at purchase time.' })
  price!: number;

  @ApiProperty({ format: 'date-time' })
  purchasedAt!: string;
}

/**
 * A team inventory entry (plan §15.9). Carries the bought item's title and the
 * QR tool (with `publicUrl`) — deliberately NO price; the price snapshot lives
 * on the {@link PurchaseResponseDto} record, not the inventory.
 */
export class InventoryItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  shopItemId!: string;

  @ApiProperty()
  shopItemTitle!: string;

  @ApiProperty({ format: 'date-time' })
  addedAt!: string;

  @ApiProperty({ type: QrToolResponseDto })
  qrTool!: QrToolResponseDto;
}

/**
 * The lean new-inventory-entry projection inside the {@link
 * PurchaseResultResponseDto} (the QR tool is a sibling field there, not nested).
 */
export class PurchaseResultInventoryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  shopItemId!: string;

  @ApiProperty()
  qrToolId!: string;

  @ApiProperty({ format: 'date-time' })
  addedAt!: string;
}

/**
 * The reply to a successful `POST purchase`, sent to the buying captain (plan
 * §15.8). Rich on purpose — it carries the QR `publicUrl` so the captain gets
 * the bought tool immediately; this is a captain-scoped reply behind the
 * player guard, never a room broadcast.
 */
export class PurchaseResultResponseDto {
  @ApiProperty({ type: PurchaseResponseDto })
  purchase!: PurchaseResponseDto;

  @ApiProperty({ type: PurchaseResultInventoryDto })
  inventoryItem!: PurchaseResultInventoryDto;

  @ApiProperty({ type: QrToolResponseDto })
  qrTool!: QrToolResponseDto;

  @ApiProperty({ description: "The team's balance after the debit (§14.7)." })
  balance!: number;
}

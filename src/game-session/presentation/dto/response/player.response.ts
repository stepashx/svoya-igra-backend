import { ApiProperty } from '@nestjs/swagger';

/** Public view of a player. Never includes the reconnect token. */
export class PlayerResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  roomId!: string;

  @ApiProperty({ nullable: true })
  teamId!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  avatar!: string | null;

  @ApiProperty()
  isCaptain!: boolean;

  @ApiProperty({ enum: ['CONNECTED', 'DISCONNECTED'] })
  connectionStatus!: string;

  @ApiProperty({ format: 'date-time' })
  joinedAt!: string;

  @ApiProperty({ format: 'date-time' })
  lastSeenAt!: string;
}

/**
 * Returned once to the owner on join/reconnect: the player plus the secret
 * reconnect token to store locally (plan §17 reconnect).
 */
export class PlayerIdentityResponseDto {
  @ApiProperty({ type: PlayerResponseDto })
  player!: PlayerResponseDto;

  @ApiProperty({ description: 'Store as playerReconnectToken (localStorage).' })
  reconnectToken!: string;
}

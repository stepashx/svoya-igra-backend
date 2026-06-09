import { ApiProperty } from '@nestjs/swagger';

/** Public view of a room. Never includes the host reconnect token. */
export class RoomResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'ABCDEF' })
  code!: string;

  @ApiProperty({ enum: ['ACTIVE', 'FINISHED', 'CLOSED'] })
  status!: string;

  @ApiProperty({ example: 'LOBBY' })
  currentStage!: string;

  @ApiProperty({ nullable: true })
  currentTeamId!: string | null;

  @ApiProperty()
  totalQuestionsCount!: number;

  @ApiProperty()
  blockedQuestionsCount!: number;

  @ApiProperty()
  currentShopRound!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  finishedAt!: string | null;
}

/**
 * Returned once to the creator of a room: the room plus the host identity and
 * the secret host reconnect token to store locally (plan §17 reconnect).
 */
export class CreateRoomResponseDto {
  @ApiProperty({ type: RoomResponseDto })
  room!: RoomResponseDto;

  @ApiProperty()
  hostId!: string;

  @ApiProperty({ description: 'Store as hostReconnectToken (localStorage).' })
  hostReconnectToken!: string;
}

/** Lightweight status view for the room-status endpoint. */
export class RoomStatusResponseDto {
  @ApiProperty({ enum: ['ACTIVE', 'FINISHED', 'CLOSED'] })
  status!: string;

  @ApiProperty({ example: 'LOBBY' })
  currentStage!: string;
}

/** The current stage, for the game-stage endpoint. */
export class StageResponseDto {
  @ApiProperty({ example: 'GAME_BOARD' })
  currentStage!: string;
}

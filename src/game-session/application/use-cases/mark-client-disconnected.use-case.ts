import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
} from '../../domain/ports';
import { ConnectionEvent } from '../events';

export interface MarkClientDisconnectedInput {
  roomId: string;
  playerId: string;
}

/**
 * A player's socket dropped (plan §16.1): mark the player DISCONNECTED and
 * broadcast `connection-lost` room-wide. The gateway calls this only when the
 * player's LAST socket leaves (multi-tab is handled by the presence registry).
 *
 * A vanished player — already removed/cleaned up — is a graceful no-op: a
 * disconnect path must never throw, so there is nothing to broadcast.
 */
@Injectable()
export class MarkClientDisconnectedUseCase {
  constructor(
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
  ) {}

  async execute(input: MarkClientDisconnectedInput): Promise<void> {
    const player = await this.players.findById(input.playerId);
    if (!player) {
      return;
    }

    player.markDisconnected(this.clock.now());
    await this.players.update(player);

    this.realtime.emitToRoom(input.roomId, ConnectionEvent.ConnectionLost, {
      roomId: input.roomId,
      playerId: player.id,
    });
  }
}

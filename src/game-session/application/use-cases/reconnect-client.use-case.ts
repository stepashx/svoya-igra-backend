import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { PlayerNotFoundError, RoomNotFoundError } from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
} from '../../domain/ports';
import { GameSessionEvent, playerSummary } from '../events';
import {
  RoomAggregateSnapshot,
  RoomSnapshotAssembler,
} from '../queries/room-snapshot.assembler';

/** Which identity is reconnecting. The transport guard resolves it upstream. */
export type ReconnectPrincipal = 'player' | 'host';

export interface ReconnectClientInput {
  roomId: string;
  principalHint: ReconnectPrincipal;
  /** Required when `principalHint` is `player`. */
  playerId?: string;
}

/**
 * Restore a player's or host's identity over REST and return the current room
 * snapshot (plan §16.1, §17 reconnect). The caller's token is already verified
 * by the route guard; this use case applies the reconnect side effects — a
 * player is marked CONNECTED — and broadcasts the matching event. Socket-level
 * presence/snapshot-to-socket is 5.2b.
 */
@Injectable()
export class ReconnectClientUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    private readonly assembler: RoomSnapshotAssembler,
  ) {}

  async execute(input: ReconnectClientInput): Promise<RoomAggregateSnapshot> {
    const room = await this.rooms.findById(input.roomId);
    if (!room) {
      throw new RoomNotFoundError();
    }

    if (input.principalHint === 'player') {
      const player = input.playerId
        ? await this.players.findById(input.playerId)
        : null;
      if (!player) {
        throw new PlayerNotFoundError();
      }
      player.markConnected(this.clock.now());
      await this.players.update(player);
      this.realtime.emitToRoom(room.id, GameSessionEvent.ClientReconnected, {
        roomId: room.id,
        player: playerSummary(player),
      });
    } else {
      this.realtime.emitToRoom(room.id, GameSessionEvent.HostReconnected, {
        roomId: room.id,
        hostId: room.hostId,
      });
    }

    return this.assembler.assemble(room);
  }
}

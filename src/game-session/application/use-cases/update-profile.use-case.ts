import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { Player } from '../../domain/entities';
import { PlayerNotFoundError, RoomNotFoundError } from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
} from '../../domain/ports';
import { PlayerName } from '../../domain/value-objects';
import { GameSessionEvent, playerSummary } from '../events';

export interface UpdateProfileInput {
  roomId: string;
  actingPlayerId: string;
  /** New display name; omit to leave unchanged. */
  name?: string;
  /** New avatar (string to set, `null` to clear); omit to leave unchanged. */
  avatar?: string | null;
}

/**
 * Change the current player's name and/or avatar (plan §15.2; realtime
 * `player-profile-updated`). A duplicate name is rejected by the
 * `players_room_id_name_uq` constraint (→ PlayerNameTakenError).
 */
@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
  ) {}

  async execute(input: UpdateProfileInput): Promise<Player> {
    const room = await this.rooms.findById(input.roomId);
    if (!room) {
      throw new RoomNotFoundError();
    }

    const player = await this.players.findById(input.actingPlayerId);
    if (!player || player.roomId !== room.id) {
      throw new PlayerNotFoundError();
    }

    if (input.name !== undefined) {
      player.rename(PlayerName.create(input.name));
    }
    if (input.avatar !== undefined) {
      player.changeAvatar(input.avatar);
    }

    await this.players.update(player);

    this.realtime.emitToRoom(room.id, GameSessionEvent.PlayerProfileUpdated, {
      roomId: room.id,
      player: playerSummary(player),
    });

    return player;
  }
}

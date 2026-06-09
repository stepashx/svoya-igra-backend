import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  ID_GENERATOR_PORT,
  IdGeneratorPort,
} from '../../../core/ports/id-generator.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import {
  TOKEN_GENERATOR_PORT,
  TokenGeneratorPort,
} from '../../../core/ports/token-generator.port';
import { Player } from '../../domain/entities';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
} from '../../domain/ports';
import {
  PlayerName,
  ReconnectToken,
  RoomCode,
} from '../../domain/value-objects';
import { GameSessionEvent, playerSummary } from '../events';

export interface JoinRoomInput {
  code: string;
  name: string;
}

/**
 * Join a room as a player (plan §14.1, §15.2). Validates the code and name via
 * their value objects, refuses closed/finished rooms, and lets the
 * `players_room_id_name_uq` constraint reject a duplicate name (translated to
 * PlayerNameTakenError by the repository). Issues the player a reconnect token
 * and broadcasts `player-joined`.
 */
@Injectable()
export class JoinRoomUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(TOKEN_GENERATOR_PORT) private readonly tokens: TokenGeneratorPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
  ) {}

  async execute(input: JoinRoomInput): Promise<Player> {
    const code = RoomCode.create(input.code);
    const room = await this.rooms.findByCode(code);
    if (!room) {
      throw new RoomNotFoundError();
    }
    if (room.status !== 'ACTIVE') {
      throw new RoomNotActiveError();
    }

    const name = PlayerName.create(input.name);
    const player = Player.create(
      {
        id: this.ids.generate(),
        roomId: room.id,
        name,
        reconnectToken: ReconnectToken.create(this.tokens.generateToken()),
      },
      this.clock.now(),
    );

    await this.players.create(player);

    this.realtime.emitToRoom(room.id, GameSessionEvent.PlayerJoined, {
      roomId: room.id,
      player: playerSummary(player),
    });

    return player;
  }
}

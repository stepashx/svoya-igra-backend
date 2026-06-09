import { Inject, Injectable } from '@nestjs/common';
import { Player, Room, Team } from '../../domain/entities';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';

/**
 * A consistent read of one room's lobby aggregate: the room plus its players
 * and teams, as domain entities. The presentation layer maps it to a response
 * DTO; the application layer never deals in DTOs.
 */
export interface RoomAggregateSnapshot {
  room: Room;
  players: Player[];
  teams: Team[];
}

/**
 * Loads the full lobby aggregate for a room. Used by the room-state read
 * endpoints and by ReconnectClient to return the caller a current snapshot.
 */
@Injectable()
export class RoomSnapshotAssembler {
  constructor(
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT)
    private readonly teams: TeamRepositoryPort,
  ) {}

  async assemble(room: Room): Promise<RoomAggregateSnapshot> {
    const [players, teams] = await Promise.all([
      this.players.findByRoomId(room.id),
      this.teams.findByRoomId(room.id),
    ]);
    return { room, players, teams };
  }
}

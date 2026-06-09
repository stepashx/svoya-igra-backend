import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { AppConfigService } from '../../../config/app-config.service';
import { Player } from '../../domain/entities';
import {
  AlreadyOnTeamError,
  PlayerNotFoundError,
  RoomNotActiveError,
  RoomNotFoundError,
  TeamFullError,
  TeamNotFoundError,
} from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { GameSessionEvent, playerSummary, teamSummary } from '../events';

export interface JoinTeamInput {
  roomId: string;
  teamId: string;
  actingPlayerId: string;
}

/**
 * Join an existing team (plan §14.2). Runs in a transaction guarded by a
 * per-room advisory lock so the `maxPlayersPerTeam` limit holds under
 * concurrency. A joiner is a plain member — captaincy was fixed when the team
 * was created. Broadcasts `team-joined` and `team-updated`.
 */
@Injectable()
export class JoinTeamUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    private readonly config: AppConfigService,
  ) {}

  async execute(input: JoinTeamInput): Promise<Player> {
    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }

      const team = await this.teams.findById(input.teamId);
      if (!team || team.roomId !== room.id) {
        throw new TeamNotFoundError();
      }

      const player = await this.players.findById(input.actingPlayerId);
      if (!player || player.roomId !== room.id) {
        throw new PlayerNotFoundError();
      }
      if (player.teamId !== null) {
        throw new AlreadyOnTeamError();
      }

      const memberCount = await this.players.countByTeamId(team.id);
      if (memberCount >= this.config.gameLimits.maxPlayersPerTeam) {
        throw new TeamFullError();
      }

      player.joinTeam(team.id);
      await this.players.update(player);

      this.realtime.emitToRoom(room.id, GameSessionEvent.TeamJoined, {
        roomId: room.id,
        teamId: team.id,
        player: playerSummary(player),
      });
      this.realtime.emitToRoom(room.id, GameSessionEvent.TeamUpdated, {
        roomId: room.id,
        team: teamSummary(team),
      });

      return player;
    });
  }
}

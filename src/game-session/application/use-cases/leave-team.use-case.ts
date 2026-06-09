import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { Player } from '../../domain/entities';
import {
  CaptainCannotLeaveError,
  PlayerNotFoundError,
  RoomNotActiveError,
  RoomNotFoundError,
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
import { GameSessionEvent, teamSummary } from '../events';

export interface LeaveTeamInput {
  roomId: string;
  teamId: string;
  actingPlayerId: string;
}

/**
 * Leave a team (plan §14.2; realtime `team-updated`). A plain member detaches
 * from the team. The captain may NOT leave: captaincy is assign-once and never
 * demoted (Player has no demote, Team no captain-vacate), so a captain leaving
 * would orphan the team — rejected as a domain-rule violation. See report
 * open question on the captain-leave rule.
 */
@Injectable()
export class LeaveTeamUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
  ) {}

  async execute(input: LeaveTeamInput): Promise<Player> {
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
    if (player.teamId !== team.id) {
      throw new TeamNotFoundError();
    }
    if (player.isCaptain) {
      throw new CaptainCannotLeaveError();
    }

    player.leaveTeam();
    await this.players.update(player);

    this.realtime.emitToRoom(room.id, GameSessionEvent.TeamUpdated, {
      roomId: room.id,
      teamId: team.id,
      team: teamSummary(team),
    });

    return player;
  }
}

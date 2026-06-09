import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { AppConfigService } from '../../../config/app-config.service';
import { Team } from '../../domain/entities';
import {
  NotTeamCaptainError,
  RoomNotActiveError,
  RoomNotFoundError,
  TeamNotFoundError,
} from '../../domain/errors';
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { GameSessionEvent, teamSummary } from '../events';

export interface MarkTeamReadyInput {
  roomId: string;
  teamId: string;
  actingPlayerId: string;
  isReady: boolean;
}

/**
 * Toggle a team's readiness (plan §14.2; realtime `team-ready-changed`).
 * Captain-only. When the count of ready teams first reaches
 * `minTeamsToStart` the room advances TEAM_SETUP → READY_CHECK. Also broadcasts
 * `game-can-start-changed` with the current "host can start" flag.
 */
@Injectable()
export class MarkTeamReadyUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    private readonly config: AppConfigService,
  ) {}

  async execute(input: MarkTeamReadyInput): Promise<Team> {
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
    if (team.captainPlayerId !== input.actingPlayerId) {
      throw new NotTeamCaptainError();
    }

    if (input.isReady) {
      team.markReady();
    } else {
      team.markNotReady();
    }
    await this.teams.update(team);

    const roomTeams = await this.teams.findByRoomId(room.id);
    const readyCount = roomTeams.filter((t) => t.isReady).length;
    const canStart = readyCount >= this.config.gameLimits.minTeamsToStart;

    let stageAdvanced = false;
    if (canStart && room.currentStage === 'TEAM_SETUP') {
      room.transitionTo('READY_CHECK');
      await this.rooms.update(room);
      stageAdvanced = true;
    }

    this.realtime.emitToRoom(room.id, GameSessionEvent.TeamReadyChanged, {
      roomId: room.id,
      team: teamSummary(team),
    });
    this.realtime.emitToRoom(room.id, GameSessionEvent.GameCanStartChanged, {
      roomId: room.id,
      canStart,
      readyCount,
    });
    if (stageAdvanced) {
      this.realtime.emitToRoom(room.id, GameSessionEvent.GameStageChanged, {
        roomId: room.id,
        stage: room.currentStage,
      });
    }

    return team;
  }
}

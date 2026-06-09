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
import { AppConfigService } from '../../../config/app-config.service';
import { Team } from '../../domain/entities';
import {
  AlreadyOnTeamError,
  PlayerNotFoundError,
  RoomNotActiveError,
  RoomNotFoundError,
  TeamLimitReachedError,
} from '../../domain/errors';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { TeamName } from '../../domain/value-objects';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { GameSessionEvent, playerSummary, teamSummary } from '../events';

export interface CreateTeamInput {
  roomId: string;
  actingPlayerId: string;
  name: string;
}

/**
 * Create a team (plan §14.2). The creating player becomes its first member and
 * captain (first-in-team rule). Runs in a transaction guarded by a per-room
 * advisory lock so the `maxTeams` limit is enforced under concurrency; the first
 * team in a room advances the stage LOBBY → TEAM_SETUP. Broadcasts
 * `team-created` (+ `game-stage-changed` on the first team).
 */
@Injectable()
export class CreateTeamUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(ID_GENERATOR_PORT) private readonly ids: IdGeneratorPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    private readonly config: AppConfigService,
  ) {}

  async execute(input: CreateTeamInput): Promise<Team> {
    const name = TeamName.create(input.name);

    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }

      const player = await this.players.findById(input.actingPlayerId);
      if (!player || player.roomId !== room.id) {
        throw new PlayerNotFoundError();
      }
      if (player.teamId !== null) {
        throw new AlreadyOnTeamError();
      }

      const teamCount = await this.teams.countByRoomId(room.id);
      if (teamCount >= this.config.gameLimits.maxTeams) {
        throw new TeamLimitReachedError();
      }

      const team = Team.create(
        { id: this.ids.generate(), roomId: room.id, name },
        this.clock.now(),
      );
      team.assignCaptain(player.id);
      await this.teams.create(team);

      player.joinTeam(team.id);
      player.promoteToCaptain();
      await this.players.update(player);

      const firstTeam = teamCount === 0 && room.currentStage === 'LOBBY';
      if (firstTeam) {
        room.transitionTo('TEAM_SETUP');
        await this.rooms.update(room);
      }

      this.realtime.emitToRoom(room.id, GameSessionEvent.TeamCreated, {
        roomId: room.id,
        team: teamSummary(team),
        captain: playerSummary(player),
      });
      if (firstTeam) {
        this.realtime.emitToRoom(room.id, GameSessionEvent.GameStageChanged, {
          roomId: room.id,
          stage: room.currentStage,
        });
      }

      return team;
    });
  }
}

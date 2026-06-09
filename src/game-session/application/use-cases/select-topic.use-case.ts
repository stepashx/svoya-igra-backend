import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { Team } from '../../domain/entities';
import {
  NotTeamCaptainError,
  RoomNotActiveError,
  RoomNotFoundError,
  TeamNotFoundError,
  TopicNotFoundError,
} from '../../domain/errors';
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
  TOPIC_REPOSITORY_PORT,
  TopicRepositoryPort,
} from '../../domain/ports';
import { GameSessionEvent, teamSummary } from '../events';

export interface SelectTopicInput {
  roomId: string;
  teamId: string;
  actingPlayerId: string;
  topicId: string;
}

/**
 * Select a team's presentation topic (plan §14.3). Captain-only (fine-grained
 * authz). The topic must exist in the global catalog; a topic already taken by
 * another team in the room is rejected by the
 * `teams_room_id_selected_topic_id_uq` constraint (→ TopicAlreadyTakenError).
 * Broadcasts `team-topic-selected`.
 */
@Injectable()
export class SelectTopicUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(TOPIC_REPOSITORY_PORT) private readonly topics: TopicRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
  ) {}

  async execute(input: SelectTopicInput): Promise<Team> {
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

    const topic = await this.topics.findById(input.topicId);
    if (!topic) {
      throw new TopicNotFoundError();
    }

    team.selectTopic(topic.id);
    await this.teams.update(team);

    this.realtime.emitToRoom(room.id, GameSessionEvent.TeamTopicSelected, {
      roomId: room.id,
      team: teamSummary(team),
    });

    return team;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  RANDOM_GENERATOR_PORT,
  RandomGeneratorPort,
} from '../../../core/ports/randomness.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { AppConfigService } from '../../../config/app-config.service';
import { Team, Topic } from '../../domain/entities';
import {
  NoFreeTopicsError,
  NotEnoughReadyTeamsError,
  RoomNotActiveError,
  RoomNotFoundError,
} from '../../domain/errors';
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
  TOPIC_REPOSITORY_PORT,
  TopicRepositoryPort,
} from '../../domain/ports';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { GameSessionEvent, roomSummary, teamSummary } from '../events';
import {
  RoomAggregateSnapshot,
  RoomSnapshotAssembler,
} from '../queries/room-snapshot.assembler';

export interface StartGameInput {
  roomId: string;
}

/**
 * Host starts the game (plan §14.3, §14.5, §16.3). Requires at least
 * `minTeamsToStart` ready teams. The ready teams are the participants: each
 * without a topic gets a distinct random free one, all get a random turn order,
 * and the first team (turn order 0) is chosen at random and set as the active
 * team. The room advances READY_CHECK → GAME_BOARD. Runs in a transaction under
 * the per-room advisory lock. Broadcasts the §16.3 game-start events.
 */
@Injectable()
export class StartGameUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(TOPIC_REPOSITORY_PORT) private readonly topics: TopicRepositoryPort,
    @Inject(RANDOM_GENERATOR_PORT) private readonly random: RandomGeneratorPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    private readonly assembler: RoomSnapshotAssembler,
    private readonly config: AppConfigService,
  ) {}

  async execute(input: StartGameInput): Promise<RoomAggregateSnapshot> {
    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }

      const allTeams = await this.teams.findByRoomId(room.id);
      const participants = allTeams.filter((team) => team.isReady);
      if (participants.length < this.config.gameLimits.minTeamsToStart) {
        throw new NotEnoughReadyTeamsError();
      }

      const catalog = await this.topics.findAll();
      this.autoAssignTopics(participants, allTeams, catalog);

      const ordered = this.random.shuffle(participants);
      ordered.forEach((team, index) => team.assignTurnOrder(index));
      const firstTeam = ordered[0];
      room.assignCurrentTeam(firstTeam.id);

      room.transitionTo('GAME_BOARD');

      for (const team of participants) {
        await this.teams.update(team);
      }
      await this.rooms.update(room);

      this.emitStartEvents(room.id, roomSummary(room), ordered, firstTeam.id);

      return this.assembler.assemble(room);
    });
  }

  /** Give every participant without a topic a distinct random free topic. */
  private autoAssignTopics(
    participants: Team[],
    allTeams: Team[],
    catalog: Topic[],
  ): void {
    const needTopic = participants.filter((team) => !team.selectedTopicId);
    if (needTopic.length === 0) {
      return;
    }
    const taken = new Set(
      allTeams
        .map((team) => team.selectedTopicId)
        .filter((id): id is string => id !== null),
    );
    const free = this.random.shuffle(
      catalog.map((topic) => topic.id).filter((id) => !taken.has(id)),
    );
    if (free.length < needTopic.length) {
      throw new NoFreeTopicsError();
    }
    needTopic.forEach((team, index) => team.selectTopic(free[index]));
  }

  private emitStartEvents(
    roomId: string,
    room: ReturnType<typeof roomSummary>,
    orderedTeams: Team[],
    firstTeamId: string,
  ): void {
    const teams = orderedTeams.map(teamSummary);
    this.realtime.emitToRoom(roomId, GameSessionEvent.GameStarted, {
      roomId,
      room,
      teams,
    });
    this.realtime.emitToRoom(roomId, GameSessionEvent.GameFirstTeamSelected, {
      roomId,
      currentTeamId: firstTeamId,
    });
    this.realtime.emitToRoom(roomId, GameSessionEvent.GameStageChanged, {
      roomId,
      stage: room.currentStage,
    });
    this.realtime.emitToRoom(roomId, GameSessionEvent.GameTurnChanged, {
      roomId,
      currentTeamId: firstTeamId,
    });
    this.realtime.emitToRoom(roomId, GameSessionEvent.GameStateUpdated, {
      roomId,
      room,
      teams,
    });
  }
}

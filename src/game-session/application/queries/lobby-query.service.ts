import { Inject, Injectable } from '@nestjs/common';
import { Player, Room, Team, Topic } from '../../domain/entities';
import { RoomNotFoundError, TeamNotFoundError } from '../../domain/errors';
import { GameStage } from '../../domain/types';
import {
  PLAYER_REPOSITORY_PORT,
  PlayerRepositoryPort,
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
  TOPIC_REPOSITORY_PORT,
  TopicRepositoryPort,
} from '../../domain/ports';
import { RoomCode } from '../../domain/value-objects';
import {
  RoomAggregateSnapshot,
  RoomSnapshotAssembler,
} from './room-snapshot.assembler';

/** A team with its members, for the team-detail read endpoint. */
export interface TeamWithMembers {
  team: Team;
  members: Player[];
}

/** A catalog topic plus which team (if any) holds it in the room. */
export interface RoomTopicAvailability {
  topic: Topic;
  takenByTeamId: string | null;
}

/**
 * Derived presentation-defense state (§10.16) for the public `GET defense/state`
 * read. Nothing here is stored as defense state: `currentPresenterTeamId` is the
 * room's active-team pointer and `order` the participating teams' `turnOrder`
 * ascending — the SAME projection StartDefense emits. `stage` mirrors the
 * use-case `*.stage` convention (the mapper renders it as `currentStage`).
 */
export interface DefenseState {
  stage: GameStage;
  currentPresenterTeamId: string | null;
  order: string[];
}

/**
 * Read model for the lobby GET endpoints (plan §15.1–§15.4, §15.7 reads). Pure
 * queries — no mutation, no events. Resolves the room from its code (invalid →
 * InvalidRoomCodeError, missing → RoomNotFoundError) and returns domain
 * entities; the presentation layer maps them to response DTOs.
 */
@Injectable()
export class LobbyQueryService {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(PLAYER_REPOSITORY_PORT)
    private readonly players: PlayerRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(TOPIC_REPOSITORY_PORT) private readonly topics: TopicRepositoryPort,
    private readonly assembler: RoomSnapshotAssembler,
  ) {}

  /** Resolve a room by its code, validating the code first. */
  async getRoom(code: string): Promise<Room> {
    const room = await this.rooms.findByCode(RoomCode.create(code));
    if (!room) {
      throw new RoomNotFoundError();
    }
    return room;
  }

  /** Full lobby snapshot for the room-state / game-state read endpoints. */
  async getRoomState(code: string): Promise<RoomAggregateSnapshot> {
    const room = await this.getRoom(code);
    return this.assembler.assemble(room);
  }

  async listPlayers(code: string): Promise<Player[]> {
    const room = await this.getRoom(code);
    return this.players.findByRoomId(room.id);
  }

  async listTeams(code: string): Promise<Team[]> {
    const room = await this.getRoom(code);
    return this.teams.findByRoomId(room.id);
  }

  async getTeamWithMembers(
    code: string,
    teamId: string,
  ): Promise<TeamWithMembers> {
    const room = await this.getRoom(code);
    const team = await this.teams.findById(teamId);
    if (!team || team.roomId !== room.id) {
      throw new TeamNotFoundError();
    }
    const members = await this.players.findByTeamId(team.id);
    return { team, members };
  }

  async getTeamCaptain(code: string, teamId: string): Promise<Player | null> {
    const { members } = await this.getTeamWithMembers(code, teamId);
    return members.find((member) => member.isCaptain) ?? null;
  }

  /** Global topic catalog (room-independent). */
  listTopics(): Promise<Topic[]> {
    return this.topics.findAll();
  }

  /** Catalog topics annotated with their in-room availability. */
  async getRoomTopics(code: string): Promise<RoomTopicAvailability[]> {
    const room = await this.getRoom(code);
    const [catalog, teams] = await Promise.all([
      this.topics.findAll(),
      this.teams.findByRoomId(room.id),
    ]);
    const takenBy = new Map<string, string>();
    for (const team of teams) {
      if (team.selectedTopicId) {
        takenBy.set(team.selectedTopicId, team.id);
      }
    }
    return catalog.map((topic) => ({
      topic,
      takenByTeamId: takenBy.get(topic.id) ?? null,
    }));
  }

  /** The room's currently active team (null before the game starts). */
  async getActiveTeam(code: string): Promise<Team | null> {
    const room = await this.getRoom(code);
    if (!room.currentTeamId) {
      return null;
    }
    return this.teams.findById(room.currentTeamId);
  }

  /**
   * Derived presentation-defense state (§10.16) for the public `GET
   * defense/state` read. The current presenter is the room's active-team
   * pointer; the order is the participants (non-null `turnOrder`) ascending —
   * the SAME projection StartDefense/Finish/Skip use. Pure read, no mutation.
   */
  async getDefenseState(code: string): Promise<DefenseState> {
    const room = await this.getRoom(code);
    const order = (await this.teams.findByRoomId(room.id))
      .filter((team) => team.turnOrder !== null)
      .sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0))
      .map((team) => team.id);
    return {
      stage: room.currentStage,
      currentPresenterTeamId: room.currentTeamId,
      order,
    };
  }

  /**
   * The teams to evaluate in the EVALUATION stage (§15.11) — the participants
   * (non-null `turnOrder`) ascending, the SAME projection the defense order
   * uses. Lives here, not on the headless {@link EvaluationQueryService}: that
   * service cannot read teams (EvaluationModule must not import game-session),
   * exactly the reason {@link getDefenseState} lives here too. Pure read.
   */
  async listTeamsToEvaluate(code: string): Promise<Team[]> {
    const room = await this.getRoom(code);
    return (await this.teams.findByRoomId(room.id))
      .filter((team) => team.turnOrder !== null)
      .sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));
  }
}

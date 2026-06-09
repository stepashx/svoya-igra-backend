import { Player, Room, Team } from '../../domain/entities';

/**
 * Plain-object projections of the lobby entities used as room-wide event
 * payloads. Deliberately separate from the presentation DTOs: these carry no
 * Swagger metadata and live in the application layer, where the use cases that
 * emit events run. Value objects are unwrapped to primitives.
 */

export interface RoomEventSummary {
  id: string;
  code: string;
  status: string;
  currentStage: string;
  currentTeamId: string | null;
}

export interface PlayerEventSummary {
  id: string;
  roomId: string;
  teamId: string | null;
  name: string;
  avatar: string | null;
  isCaptain: boolean;
  connectionStatus: string;
}

export interface TeamEventSummary {
  id: string;
  roomId: string;
  name: string;
  captainPlayerId: string | null;
  selectedTopicId: string | null;
  isReady: boolean;
  turnOrder: number | null;
}

export function roomSummary(room: Room): RoomEventSummary {
  return {
    id: room.id,
    code: room.code.value,
    status: room.status,
    currentStage: room.currentStage,
    currentTeamId: room.currentTeamId,
  };
}

export function playerSummary(player: Player): PlayerEventSummary {
  return {
    id: player.id,
    roomId: player.roomId,
    teamId: player.teamId,
    name: player.name.value,
    avatar: player.avatar,
    isCaptain: player.isCaptain,
    connectionStatus: player.connectionStatus,
  };
}

export function teamSummary(team: Team): TeamEventSummary {
  return {
    id: team.id,
    roomId: team.roomId,
    name: team.name.value,
    captainPlayerId: team.captainPlayerId,
    selectedTopicId: team.selectedTopicId,
    isReady: team.isReady,
    turnOrder: team.turnOrder,
  };
}

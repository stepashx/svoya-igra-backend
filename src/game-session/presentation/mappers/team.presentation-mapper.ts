import { Player, Team } from '../../domain/entities';
import { TeamResponseDto, TeamWithMembersResponseDto } from '../dto/response';
import { toPlayerResponse } from './player.presentation-mapper';

/** Team entity → public response DTO. */
export function toTeamResponse(team: Team): TeamResponseDto {
  return {
    id: team.id,
    roomId: team.roomId,
    name: team.name.value,
    captainPlayerId: team.captainPlayerId,
    selectedTopicId: team.selectedTopicId,
    isReady: team.isReady,
    turnOrder: team.turnOrder,
    earnedScore: team.earnedScore.value,
    balance: team.balance.value,
    createdAt: team.createdAt.toISOString(),
  };
}

export function toTeamWithMembersResponse(
  team: Team,
  members: Player[],
): TeamWithMembersResponseDto {
  return {
    team: toTeamResponse(team),
    members: members.map(toPlayerResponse),
  };
}

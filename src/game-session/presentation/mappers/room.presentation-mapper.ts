import { Room } from '../../domain/entities';
import {
  CreateRoomResponseDto,
  RoomResponseDto,
  RoomStatusResponseDto,
  StageResponseDto,
} from '../dto/response';

/** Room entity → public response DTO (no host token). */
export function toRoomResponse(room: Room): RoomResponseDto {
  return {
    id: room.id,
    code: room.code.value,
    status: room.status,
    currentStage: room.currentStage,
    currentTeamId: room.currentTeamId,
    totalQuestionsCount: room.totalQuestionsCount,
    blockedQuestionsCount: room.blockedQuestionsCount,
    currentShopRound: room.currentShopRound,
    createdAt: room.createdAt.toISOString(),
    finishedAt: room.finishedAt ? room.finishedAt.toISOString() : null,
  };
}

/** Room entity → creator response, exposing the host token once. */
export function toCreateRoomResponse(room: Room): CreateRoomResponseDto {
  return {
    room: toRoomResponse(room),
    hostId: room.hostId,
    hostReconnectToken: room.hostReconnectToken.value,
  };
}

export function toRoomStatusResponse(room: Room): RoomStatusResponseDto {
  return { status: room.status, currentStage: room.currentStage };
}

export function toStageResponse(room: Room): StageResponseDto {
  return { currentStage: room.currentStage };
}

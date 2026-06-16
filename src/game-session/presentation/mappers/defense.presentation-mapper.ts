import { DefenseState } from '../../application/queries';
import { DefenseStateResponseDto } from '../dto/response';

/**
 * Defense state view → response DTO. Renders the use-case/query `stage` field as
 * the DTO's `currentStage` (the `CloseShopResult.stage` → `StageResponseDto`
 * convention). Serves BOTH the `POST start` result and the `GET state` read —
 * structurally identical `{ stage, currentPresenterTeamId, order }` views. Public
 * (room-wide): the order carries no secret.
 */
export function toDefenseStateResponse(
  state: DefenseState,
): DefenseStateResponseDto {
  return {
    currentStage: state.stage,
    currentPresenterTeamId: state.currentPresenterTeamId,
    order: [...state.order],
  };
}

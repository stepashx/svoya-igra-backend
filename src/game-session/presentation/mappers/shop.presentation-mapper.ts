import { ShopCatalogEntry } from '../../../commerce/application/queries';
import { ShopTimerState } from '../../application/timers';
import { Room } from '../../domain/entities';
import {
  ShopItemResponseDto,
  ShopRoundResponseDto,
  ShopTimerResponseDto,
} from '../dto/response';

/** Catalog entry → item DTO. Exposes the QR tool's id only, never its URL. */
export function toShopItemResponse(
  entry: ShopCatalogEntry,
): ShopItemResponseDto {
  return {
    id: entry.item.id,
    title: entry.item.title,
    description: entry.item.description,
    price: entry.item.price,
    qrToolId: entry.item.qrToolId,
    available: entry.available,
  };
}

/** Shop-timer state → response DTO (Date stamps rendered as ISO strings). */
export function toShopTimerResponse(
  timer: ShopTimerState,
): ShopTimerResponseDto {
  return {
    status: timer.status,
    startedAt: timer.startedAt ? timer.startedAt.toISOString() : null,
    endsAt: timer.endsAt ? timer.endsAt.toISOString() : null,
    minClosableAt: timer.minClosableAt
      ? timer.minClosableAt.toISOString()
      : null,
    remainingMs: timer.remainingMs,
    closable: timer.closable,
  };
}

/** Room + shop-timer state → the GET-round response (§15.8). */
export function toShopRoundResponse(
  room: Room,
  timer: ShopTimerState,
): ShopRoundResponseDto {
  return {
    currentShopRound: room.currentShopRound,
    currentStage: room.currentStage,
    isFinalShop: room.isBoardExhausted,
    timer: toShopTimerResponse(timer),
  };
}

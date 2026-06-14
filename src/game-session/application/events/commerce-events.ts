/**
 * Canonical server → client commerce (§16.5) broadcast names, emitted by the
 * game-session use cases (Design A: Game Flow owns the SHOP stage) through
 * {@link RealtimeEventsPort.emitToRoom} or narrower channels. They live here —
 * next to the use cases that emit them — so the application layer stays free of
 * any transport import, exactly as {@link GameplayEvent}; the commerce module
 * itself emits nothing.
 *
 * Emission status (see docs/realtime-events.md §16.5 for the full matrix):
 * - `shop-opened` / `shop-final-opened` / `shop-closed` — the lifecycle trio,
 *   emitted since 8.2 (ReviewAnswerUseCase opens, CloseShopUseCase closes).
 * - `shop-state-updated` / `shop-item-purchased` / `shop-item-unavailable` —
 *   the room-wide purchase chain, emitted since 8.3 by PurchaseItemUseCase.
 * - `inventory-updated` — emitted since 8.3 by PurchaseItemUseCase to the team
 *   audience (via the PresenceTeamRealtimeEventsAdapter), AFTER the purchase
 *   commits — the only payload carrying the QR `publicUrl`.
 * - `shop-purchase-rejected` — SUPERSEDED: no captain emitter was built; the
 *   captain receives a rejection as the REST 409 error reply instead.
 *
 * Audience (a publishing concern): room-wide for the shop lifecycle and
 * purchased-state rows, team-only for `inventory-updated`.
 *
 * Secrecy (§16.5): room-wide payloads (`shop-item-purchased`,
 * `shop-state-updated`) must NEVER carry `publicUrl` or any QR content — the
 * QR belongs to the buying team alone, reaching it only via `inventory-updated`
 * and the team-gated inventory REST reads (§15.9).
 */
export const CommerceEvent = {
  ShopOpened: 'server:commerce:shop-opened',
  ShopFinalOpened: 'server:commerce:shop-final-opened',
  ShopStateUpdated: 'server:commerce:shop-state-updated',
  ShopItemPurchased: 'server:commerce:shop-item-purchased',
  ShopItemUnavailable: 'server:commerce:shop-item-unavailable',
  ShopPurchaseRejected: 'server:commerce:shop-purchase-rejected',
  InventoryUpdated: 'server:commerce:inventory-updated',
  ShopClosed: 'server:commerce:shop-closed',
} as const;

export type CommerceEvent = (typeof CommerceEvent)[keyof typeof CommerceEvent];

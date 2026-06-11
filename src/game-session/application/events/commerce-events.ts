/**
 * Canonical server → client commerce (§16.5) broadcast names. NAME CONTRACT
 * ONLY in sub-stage 8.1 — nothing emits them yet: the shop use cases (8.2)
 * and purchase/inventory use cases (8.3) will publish through
 * {@link RealtimeEventsPort.emitToRoom} or narrower channels. They live here —
 * next to the game-session use cases that will emit them (Design A: Game Flow
 * owns the SHOP stage) — so the application layer stays free of any transport
 * import, exactly as {@link GameplayEvent}; the commerce module itself emits
 * nothing.
 *
 * Audience (a publishing concern; see docs/realtime-events.md §16.5):
 * room-wide for the shop lifecycle and purchased-state rows, captain-only for
 * `purchase-rejected`, team-only for `inventory-updated`. The team/captain
 * emitters do not exist yet — 8.3 builds an adapter over the presence
 * registry (the 6.2b host pattern) or keeps those replies REST-only.
 *
 * Secrecy (§16.5, fixed now): room-wide payloads (`shop-item-purchased`,
 * `shop-state-updated`) must NEVER carry `publicUrl` or any QR content — the
 * QR belongs to the buying team alone.
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

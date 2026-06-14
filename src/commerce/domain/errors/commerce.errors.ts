import { DomainRuleError, NotFoundError } from '../../../core/errors/app.error';

/**
 * Commerce domain error catalog. Each error extends the semantic base that
 * fixes its HTTP category ({@link NotFoundError} → 404, {@link DomainRuleError}
 * → 409) and narrows `code` to its own stable, machine-readable identifier. The
 * {@link AllExceptionsFilter} maps by base class, so adding an error here needs
 * no filter change.
 */

/**
 * The shop item is already purchased in this room (§14.8: an item is unique
 * across the whole game). Thrown by the purchase adapter when the
 * `purchases_room_id_shop_item_id_uq` index rejects a concurrent buy.
 */
export class ItemAlreadyPurchasedError extends DomainRuleError {
  readonly code = 'ITEM_ALREADY_PURCHASED';

  constructor(message = 'This item is already purchased in this game.') {
    super(message);
  }
}

/**
 * The referenced shop item does not exist in the catalog (§15.8). Thrown by
 * {@link PurchaseItemUseCase} when the requested `shopItemId` resolves to no
 * catalog row.
 */
export class ShopItemNotFoundError extends NotFoundError {
  readonly code = 'SHOP_ITEM_NOT_FOUND';

  constructor(message = 'Shop item not found.') {
    super(message);
  }
}

/**
 * The shop item's paired QR tool does not exist (§15.9). A defensive guard in
 * {@link PurchaseItemUseCase}: the `shop_items.qr_tool_id` FK is RESTRICT and
 * the seed catalog is 1:1, so this is an impossible state in practice — it
 * fails loudly rather than recording an inventory entry with a dangling tool.
 */
export class QrToolNotFoundError extends NotFoundError {
  readonly code = 'QR_TOOL_NOT_FOUND';

  constructor(message = 'QR tool not found.') {
    super(message);
  }
}

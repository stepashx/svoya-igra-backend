import { DomainRuleError } from '../../../core/errors/app.error';

/**
 * Commerce domain error catalog. Each error extends the semantic base that
 * fixes its HTTP category ({@link DomainRuleError} → 409) and narrows `code` to
 * its own stable, machine-readable identifier. The {@link AllExceptionsFilter}
 * maps by base class, so adding an error here needs no filter change.
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

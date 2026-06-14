import { asUniqueViolation } from '../../../infrastructure/database/pg-error.util';
import { ItemAlreadyPurchasedError } from '../../domain/errors';

/** Unique index enforcing "one purchase of an item per game" (§14.8). */
export const PURCHASE_UNIQUE_CONSTRAINT = 'purchases_room_id_shop_item_id_uq';

/**
 * Translate a Postgres 23505 unique violation into a commerce domain error by
 * its constraint name, then re-throw. The generic 23505 narrowing (cause-walk)
 * is the shared {@link asUniqueViolation}. Anything that is not a recognised
 * unique violation is re-thrown unchanged so it surfaces as a 500.
 *
 * Always throws; declared `never` so a `catch` block that calls it type-checks
 * as exhaustive.
 */
export function translateUniqueViolation(error: unknown): never {
  const violation = asUniqueViolation(error);
  if (violation?.constraint === PURCHASE_UNIQUE_CONSTRAINT) {
    throw new ItemAlreadyPurchasedError();
  }
  throw error;
}

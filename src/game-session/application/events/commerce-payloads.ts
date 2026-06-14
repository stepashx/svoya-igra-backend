import { ShopCatalogEntry } from '../../../commerce/application/queries';

/**
 * Plain-object projections used as commerce (§16.5) event payloads. As with the
 * gameplay {@link boardCellSummary}, these carry no Swagger metadata and live in
 * the application layer where the emitting use case runs — intentionally
 * separate from the presentation DTOs (the purchase use case must not reach for
 * `toShopItemResponse`).
 */

export interface ShopCatalogEventSummary {
  id: string;
  title: string;
  description: string | null;
  price: number;
  qrToolId: string;
  available: boolean;
}

/**
 * Catalog entry → room-facing item projection for `shop-state-updated`.
 * DELIBERATELY exposes the QR tool's id only — never `publicUrl` or any QR
 * content (§16.5 secrecy: the tool reaches the buying team alone, over the
 * team-audience `inventory-updated` and the guarded inventory REST reads).
 */
export function shopCatalogSummary(
  entry: ShopCatalogEntry,
): ShopCatalogEventSummary {
  return {
    id: entry.item.id,
    title: entry.item.title,
    description: entry.item.description,
    price: entry.item.price,
    qrToolId: entry.item.qrToolId,
    available: entry.available,
  };
}

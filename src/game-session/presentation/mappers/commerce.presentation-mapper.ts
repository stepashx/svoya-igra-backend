import { InventoryItemView } from '../../../commerce/application/queries';
import { Purchase, QrTool } from '../../../commerce/domain/entities';
import { PurchaseItemResult } from '../../application/use-cases';
import {
  InventoryItemResponseDto,
  PurchaseResponseDto,
  PurchaseResultResponseDto,
  QrToolResponseDto,
} from '../dto/response';

/** QR tool entity → response DTO. publicUrl included (team-gated reads only). */
export function toQrToolResponse(qrTool: QrTool): QrToolResponseDto {
  return {
    id: qrTool.id,
    title: qrTool.title,
    description: qrTool.description,
    fileFormat: qrTool.fileFormat,
    publicUrl: qrTool.publicUrl,
  };
}

/** Purchase record → response DTO for the `GET purchases` list (no QR secrets). */
export function toPurchaseResponse(purchase: Purchase): PurchaseResponseDto {
  return {
    id: purchase.id,
    teamId: purchase.teamId,
    shopItemId: purchase.shopItemId,
    price: purchase.price,
    purchasedAt: purchase.purchasedAt.toISOString(),
  };
}

/** Hydrated inventory view → response DTO (carries the QR tool, never a price). */
export function toInventoryItemResponse(
  view: InventoryItemView,
): InventoryItemResponseDto {
  return {
    id: view.inventoryItem.id,
    shopItemId: view.inventoryItem.shopItemId,
    shopItemTitle: view.shopItem.title,
    addedAt: view.inventoryItem.addedAt.toISOString(),
    qrTool: toQrToolResponse(view.qrTool),
  };
}

/** Purchase use-case result → the captain's rich reply (publicUrl allowed). */
export function toPurchaseResultResponse(
  result: PurchaseItemResult,
): PurchaseResultResponseDto {
  return {
    purchase: toPurchaseResponse(result.purchase),
    inventoryItem: {
      id: result.inventoryItem.id,
      shopItemId: result.inventoryItem.shopItemId,
      qrToolId: result.inventoryItem.qrToolId,
      addedAt: result.inventoryItem.addedAt.toISOString(),
    },
    qrTool: toQrToolResponse(result.qrTool),
    balance: result.balance,
  };
}

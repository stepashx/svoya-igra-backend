import { Controller, Get, NotImplementedException, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';

const NOT_IMPLEMENTED = 'Shop/Inventory arrive in Stages 8.2/8.3.';

/**
 * Shop REST surface (plan §15.8), nested under a room — 501 stubs only
 * (sub-stage 8.1, mirroring the deferred `game/finish`). Design A: the
 * commerce routes live here because Game Flow owns the stages (SHOP) and the
 * turn. The real handlers land per sub-stage:
 *
 * - `GET items` — the catalog with per-room purchased-state (8.2; needed for
 *   reconnect into SHOP).
 * - `GET round` — the current shop round (8.2).
 * - `POST close` — host closes the shop (8.2).
 * - `POST purchase` — captain-only, "first to buy" (8.3).
 * - `GET purchases` — the room's purchase facts (8.3).
 *
 * No guards on the stubs (the `finish` precedent) — they arrive with the
 * implementations: HostAuthGuard on `close`, PlayerIdentityGuard (captain) on
 * `purchase`.
 */
@ApiTags(SwaggerTag.Commerce)
@Controller('rooms/:code/shop')
export class ShopController {
  @Get('items')
  @ApiOperation({ summary: 'List the shop catalog with availability' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  listItems(): never {
    throw new NotImplementedException();
  }

  @Post('purchase')
  @ApiOperation({ summary: 'Purchase a shop item (captain only)' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  purchase(): never {
    throw new NotImplementedException();
  }

  @Get('round')
  @ApiOperation({ summary: 'Get the current shop round' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getRound(): never {
    throw new NotImplementedException();
  }

  @Post('close')
  @ApiOperation({ summary: 'Close the shop (host only)' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  close(): never {
    throw new NotImplementedException();
  }

  @Get('purchases')
  @ApiOperation({ summary: "List the room's purchases" })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  listPurchases(): never {
    throw new NotImplementedException();
  }
}

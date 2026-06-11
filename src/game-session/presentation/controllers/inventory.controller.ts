import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';

const NOT_IMPLEMENTED = 'Shop/Inventory arrive in Stages 8.2/8.3.';

/**
 * Inventory REST surface (plan §15.9), nested under a room — 501 stubs only
 * (sub-stage 8.1, mirroring the deferred `game/finish`). Design A: the
 * commerce routes live here because Game Flow owns the stages and the turn.
 * Both real handlers land in 8.3:
 *
 * - `GET teams/:teamId` — the team's inventory entries.
 * - `GET teams/:teamId/qr-tools` — the QR tools behind those entries
 *   (publicUrl is team-owned — never in a room-wide payload).
 *
 * No guards on the stubs (the `finish` precedent) — they arrive with the
 * implementations: team-membership/host gating on both reads.
 */
@ApiTags(SwaggerTag.Commerce)
@Controller('rooms/:code/inventory')
export class InventoryController {
  @Get('teams/:teamId')
  @ApiOperation({ summary: "Get a team's inventory" })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getTeamInventory(): never {
    throw new NotImplementedException();
  }

  @Get('teams/:teamId/qr-tools')
  @ApiOperation({ summary: "Get the QR tools behind a team's inventory" })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getTeamQrTools(): never {
    throw new NotImplementedException();
  }
}

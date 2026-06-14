import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { InventoryQueryService } from '../../../commerce/application/queries';
import { LobbyQueryService } from '../../application/queries';
import { InventoryItemResponseDto, QrToolResponseDto } from '../dto/response';
import {
  HOST_TOKEN_HEADER,
  PLAYER_TOKEN_HEADER,
  TeamMemberOrHostGuard,
} from '../http';
import { toInventoryItemResponse, toQrToolResponse } from '../mappers';

/**
 * Inventory REST surface (plan §15.9), nested under a room. Design A: the
 * commerce routes live here because Game Flow owns the stages and the turn,
 * while the inventory reads come from the commerce-exported
 * {@link InventoryQueryService}. Sub-stage 8.3 ships both reads, each gated by
 * the {@link TeamMemberOrHostGuard} (the team's own members OR the room host):
 *
 * - `GET teams/:teamId` — the team's inventory entries (item title + QR tool).
 * - `GET teams/:teamId/qr-tools` — the QR tools behind those entries.
 *
 * Both carry the QR `publicUrl` — allowed here because the reads are gated to
 * the owning team or the host; it never enters a room-wide payload (§16.5).
 * The guard accepts both credentials, so both header docs are advertised.
 */
@ApiTags(SwaggerTag.Commerce)
@Controller('rooms/:code/inventory')
export class InventoryController {
  constructor(
    private readonly lobby: LobbyQueryService,
    private readonly inventory: InventoryQueryService,
  ) {}

  @Get('teams/:teamId')
  @UseGuards(TeamMemberOrHostGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: false })
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: false })
  @ApiOperation({ summary: "Get a team's inventory (team members or host)" })
  @ApiOkResponse({ type: [InventoryItemResponseDto] })
  async getTeamInventory(
    @Param('code') code: string,
    @Param('teamId') teamId: string,
  ): Promise<InventoryItemResponseDto[]> {
    const room = await this.lobby.getRoom(code);
    const views = await this.inventory.listTeamInventory(room.id, teamId);
    return views.map(toInventoryItemResponse);
  }

  @Get('teams/:teamId/qr-tools')
  @UseGuards(TeamMemberOrHostGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: false })
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: false })
  @ApiOperation({
    summary:
      "Get the QR tools behind a team's inventory (team members or host)",
  })
  @ApiOkResponse({ type: [QrToolResponseDto] })
  async getTeamQrTools(
    @Param('code') code: string,
    @Param('teamId') teamId: string,
  ): Promise<QrToolResponseDto[]> {
    const room = await this.lobby.getRoom(code);
    const tools = await this.inventory.listTeamQrTools(room.id, teamId);
    return tools.map(toQrToolResponse);
  }
}

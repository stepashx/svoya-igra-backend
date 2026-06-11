import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { ShopQueryService } from '../../../commerce/application/queries';
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import { CloseShopUseCase } from '../../application/use-cases';
import {
  ShopItemResponseDto,
  ShopRoundResponseDto,
  StageResponseDto,
} from '../dto/response';
import {
  CurrentHost,
  HOST_TOKEN_HEADER,
  HostAuthGuard,
  HostContext,
} from '../http';
import { toShopItemResponse, toShopRoundResponse } from '../mappers';

const NOT_IMPLEMENTED = 'Purchases arrive in Stage 8.3.';

/**
 * Shop REST surface (plan §15.8), nested under a room. Design A: the commerce
 * routes live here because Game Flow owns the stages (SHOP) and the turn,
 * while the catalog read model is the commerce-exported
 * {@link ShopQueryService}. Sub-stage 8.2 wires the shop lifecycle:
 *
 * - `GET items` — the catalog with per-room purchased-state (open: needed for
 *   reconnect into SHOP).
 * - `GET round` — the current shop round, finality and timer (open).
 * - `POST close` — the host closes the shop (HostAuthGuard); the same call
 *   serves the close button and the expired countdown (the `advance` pattern).
 *
 * The purchase chain stays 501 until 8.3: `POST purchase` (captain-only,
 * "first to buy") and `GET purchases`.
 */
@ApiTags(SwaggerTag.Commerce)
@Controller('rooms/:code/shop')
export class ShopController {
  constructor(
    private readonly shopQuery: ShopQueryService,
    private readonly closeShop: CloseShopUseCase,
    private readonly lobby: LobbyQueryService,
    private readonly timers: TimerQueryService,
  ) {}

  @Get('items')
  @ApiOperation({ summary: 'List the shop catalog with availability' })
  @ApiOkResponse({ type: [ShopItemResponseDto] })
  async listItems(@Param('code') code: string): Promise<ShopItemResponseDto[]> {
    const room = await this.lobby.getRoom(code);
    const catalog = await this.shopQuery.listCatalog(room.id);
    return catalog.map(toShopItemResponse);
  }

  @Post('purchase')
  @ApiOperation({ summary: 'Purchase a shop item (captain only)' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  purchase(): never {
    throw new NotImplementedException();
  }

  @Get('round')
  @ApiOperation({ summary: 'Get the current shop round' })
  @ApiOkResponse({ type: ShopRoundResponseDto })
  async getRound(@Param('code') code: string): Promise<ShopRoundResponseDto> {
    const room = await this.lobby.getRoom(code);
    const timer = await this.timers.readShop(code);
    return toShopRoundResponse(room, timer);
  }

  @Post('close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Close the shop (host only)' })
  @ApiOkResponse({ type: StageResponseDto })
  async close(@CurrentHost() host: HostContext): Promise<StageResponseDto> {
    const result = await this.closeShop.execute({ roomId: host.roomId });
    return { currentStage: result.stage };
  }

  @Get('purchases')
  @ApiOperation({ summary: "List the room's purchases" })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  listPurchases(): never {
    throw new NotImplementedException();
  }
}

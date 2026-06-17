import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../common/http/api-error-responses.decorator';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { ShopQueryService } from '../../../commerce/application/queries';
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import {
  CloseShopUseCase,
  PurchaseItemUseCase,
} from '../../application/use-cases';
import { Player } from '../../domain/entities';
import { PurchaseItemRequestDto } from '../dto/request';
import {
  PurchaseResponseDto,
  PurchaseResultResponseDto,
  ShopItemResponseDto,
  ShopRoundResponseDto,
  StageResponseDto,
} from '../dto/response';
import {
  CurrentHost,
  CurrentPlayer,
  HOST_TOKEN_HEADER,
  HostAuthGuard,
  HostContext,
  PLAYER_TOKEN_HEADER,
  PlayerIdentityGuard,
} from '../http';
import {
  toPurchaseResponse,
  toPurchaseResultResponse,
  toShopItemResponse,
  toShopRoundResponse,
} from '../mappers';

/**
 * Shop REST surface (plan §15.8), nested under a room. Design A: the commerce
 * routes live here because Game Flow owns the stages (SHOP) and the turn,
 * while the catalog/purchase reads come from the commerce-exported
 * {@link ShopQueryService}. Sub-stage 8.2 wired the shop lifecycle (items /
 * round / close); sub-stage 8.3 completes the surface:
 *
 * - `POST purchase` — a team captain buys an item for their OWN team
 *   (PlayerIdentityGuard for coarse authn; the {@link PurchaseItemUseCase}
 *   enforces captaincy and "first to buy"). 200 (the POST-close precedent).
 * - `GET purchases` — the room's purchase records (open; no QR content).
 *
 * The captain's purchase reply carries the QR `publicUrl`; the room broadcasts
 * and the purchase list never do (§16.5 secrecy).
 */
@ApiTags(SwaggerTag.Commerce)
@Controller('rooms/:code/shop')
export class ShopController {
  constructor(
    private readonly shopQuery: ShopQueryService,
    private readonly closeShop: CloseShopUseCase,
    private readonly purchaseItem: PurchaseItemUseCase,
    private readonly lobby: LobbyQueryService,
    private readonly timers: TimerQueryService,
  ) {}

  @Get('items')
  @ApiOperation({ summary: 'List the shop catalog with availability' })
  @ApiOkResponse({ type: [ShopItemResponseDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async listItems(@Param('code') code: string): Promise<ShopItemResponseDto[]> {
    const room = await this.lobby.getRoom(code);
    const catalog = await this.shopQuery.listCatalog(room.id);
    return catalog.map(toShopItemResponse);
  }

  @Post('purchase')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Purchase a shop item (team captain only)' })
  @ApiOkResponse({ type: PurchaseResultResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async purchase(
    @CurrentPlayer() player: Player,
    @Body() body: PurchaseItemRequestDto,
  ): Promise<PurchaseResultResponseDto> {
    const result = await this.purchaseItem.execute({
      roomId: player.roomId,
      shopItemId: body.shopItemId,
      actingPlayerId: player.id,
    });
    return toPurchaseResultResponse(result);
  }

  @Get('round')
  @ApiOperation({ summary: 'Get the current shop round' })
  @ApiOkResponse({ type: ShopRoundResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
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
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async close(@CurrentHost() host: HostContext): Promise<StageResponseDto> {
    const result = await this.closeShop.execute({ roomId: host.roomId });
    return { currentStage: result.stage };
  }

  @Get('purchases')
  @ApiOperation({ summary: "List the room's purchases" })
  @ApiOkResponse({ type: [PurchaseResponseDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async listPurchases(
    @Param('code') code: string,
  ): Promise<PurchaseResponseDto[]> {
    const room = await this.lobby.getRoom(code);
    const purchases = await this.shopQuery.listPurchases(room.id);
    return purchases.map(toPurchaseResponse);
  }
}

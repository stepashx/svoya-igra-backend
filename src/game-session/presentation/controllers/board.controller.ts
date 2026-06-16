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
import { BoardQueryService } from '../../../gameplay/application/queries';
import { LobbyQueryService } from '../../application/queries';
import { SelectQuestionUseCase } from '../../application/use-cases';
import { Player } from '../../domain/entities';
import { SelectCellRequestDto } from '../dto/request';
import {
  BoardResponseDto,
  CategoryResponseDto,
  CellResponseDto,
} from '../dto/response';
import {
  CurrentPlayer,
  PLAYER_TOKEN_HEADER,
  PlayerIdentityGuard,
} from '../http';
import {
  toBoardResponse,
  toCategoryResponse,
  toCellResponse,
} from '../mappers';

/**
 * Board REST surface (plan §15.5), nested under a room. Read endpoints are open
 * (resolve the room from `:code`); `select` is the active team captain's move
 * (PlayerIdentityGuard authenticates; the use case enforces active-team
 * captaincy). Owned by game-session per Design A — Game Flow drives the battle
 * cycle — while the board read model lives in {@link BoardQueryService}.
 */
@ApiTags(SwaggerTag.Gameplay)
@Controller('rooms/:code/board')
export class BoardController {
  constructor(
    private readonly boardQuery: BoardQueryService,
    private readonly lobby: LobbyQueryService,
    private readonly selectQuestion: SelectQuestionUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the full board' })
  @ApiOkResponse({ type: BoardResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getBoard(@Param('code') code: string): Promise<BoardResponseDto> {
    const room = await this.lobby.getRoom(code);
    return toBoardResponse(await this.boardQuery.getBoard(room.id));
  }

  @Get('categories')
  @ApiOperation({ summary: 'List the board categories' })
  @ApiOkResponse({ type: [CategoryResponseDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getCategories(): Promise<CategoryResponseDto[]> {
    const categories = await this.boardQuery.listCategories();
    return categories.map(toCategoryResponse);
  }

  @Get('cells')
  @ApiOperation({ summary: 'List the board cells' })
  @ApiOkResponse({ type: [CellResponseDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getCells(@Param('code') code: string): Promise<CellResponseDto[]> {
    const room = await this.lobby.getRoom(code);
    const cells = await this.boardQuery.listCells(room.id);
    return cells.map(toCellResponse);
  }

  @Get('active-cell')
  @ApiOperation({ summary: 'Get the active (selected/opened) cell' })
  @ApiOkResponse({ type: CellResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getActiveCell(
    @Param('code') code: string,
  ): Promise<CellResponseDto | null> {
    const room = await this.lobby.getRoom(code);
    const cell = await this.boardQuery.getActiveCell(room.id);
    return cell ? toCellResponse(cell) : null;
  }

  @Post('select')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Select a cell (active team captain)' })
  @ApiOkResponse({ type: CellResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async select(
    @CurrentPlayer() player: Player,
    @Body() dto: SelectCellRequestDto,
  ): Promise<CellResponseDto> {
    const cell = await this.selectQuestion.execute({
      roomId: player.roomId,
      actingPlayerId: player.id,
      cellId: dto.cellId,
    });
    return toCellResponse(cell);
  }
}

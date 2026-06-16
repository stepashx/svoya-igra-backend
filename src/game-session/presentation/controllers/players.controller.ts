import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../common/http/api-error-responses.decorator';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { LobbyQueryService } from '../../application/queries';
import {
  JoinRoomUseCase,
  ReconnectClientUseCase,
  UpdateProfileUseCase,
} from '../../application/use-cases';
import { Player } from '../../domain/entities';
import { JoinRoomRequestDto, UpdateProfileRequestDto } from '../dto/request';
import {
  PlayerIdentityResponseDto,
  PlayerResponseDto,
  RoomStateResponseDto,
} from '../dto/response';
import {
  CurrentPlayer,
  PLAYER_TOKEN_HEADER,
  PlayerIdentityGuard,
} from '../http';
import {
  toPlayerIdentityResponse,
  toPlayerResponse,
  toRoomStateResponse,
} from '../mappers';

/** Players REST surface (plan §15.2), nested under a room. */
@ApiTags(SwaggerTag.GameSession)
@Controller('rooms/:code/players')
export class PlayersController {
  constructor(
    private readonly joinRoom: JoinRoomUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly reconnectClient: ReconnectClientUseCase,
    private readonly lobby: LobbyQueryService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Join the room as a player' })
  @ApiCreatedResponse({ type: PlayerIdentityResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async create(
    @Param('code') code: string,
    @Body() dto: JoinRoomRequestDto,
  ): Promise<PlayerIdentityResponseDto> {
    const player = await this.joinRoom.execute({ code, name: dto.name });
    return toPlayerIdentityResponse(player);
  }

  @Get()
  @ApiOperation({ summary: 'List players in the room' })
  @ApiOkResponse({ type: [PlayerResponseDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async list(@Param('code') code: string): Promise<PlayerResponseDto[]> {
    const players = await this.lobby.listPlayers(code);
    return players.map(toPlayerResponse);
  }

  @Get('me')
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Get the current player' })
  @ApiOkResponse({ type: PlayerResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
  )
  getMe(@CurrentPlayer() player: Player): PlayerResponseDto {
    return toPlayerResponse(player);
  }

  @Patch('me')
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Update the current player profile' })
  @ApiOkResponse({ type: PlayerResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async updateMe(
    @CurrentPlayer() player: Player,
    @Body() dto: UpdateProfileRequestDto,
  ): Promise<PlayerResponseDto> {
    const updated = await this.updateProfile.execute({
      roomId: player.roomId,
      actingPlayerId: player.id,
      name: dto.name,
      avatar: dto.avatar,
    });
    return toPlayerResponse(updated);
  }

  @Post('reconnect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Reconnect a player by reconnect token' })
  @ApiOkResponse({ type: RoomStateResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async reconnect(
    @CurrentPlayer() player: Player,
  ): Promise<RoomStateResponseDto> {
    const snapshot = await this.reconnectClient.execute({
      roomId: player.roomId,
      principalHint: 'player',
      playerId: player.id,
    });
    return toRoomStateResponse(snapshot);
  }
}

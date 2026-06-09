import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { LobbyQueryService } from '../../application/queries';
import {
  CloseRoomUseCase,
  CreateRoomUseCase,
  ReconnectClientUseCase,
} from '../../application/use-cases';
import {
  CreateRoomResponseDto,
  RoomResponseDto,
  RoomStateResponseDto,
  RoomStatusResponseDto,
} from '../dto/response';
import {
  CurrentHost,
  HOST_TOKEN_HEADER,
  HostAuthGuard,
  HostContext,
} from '../http';
import {
  toCreateRoomResponse,
  toRoomResponse,
  toRoomStateResponse,
  toRoomStatusResponse,
} from '../mappers';

/** Rooms REST surface (plan §15.1). */
@ApiTags(SwaggerTag.GameSession)
@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly createRoom: CreateRoomUseCase,
    private readonly closeRoom: CloseRoomUseCase,
    private readonly reconnectClient: ReconnectClientUseCase,
    private readonly lobby: LobbyQueryService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a room' })
  @ApiCreatedResponse({ type: CreateRoomResponseDto })
  async create(): Promise<CreateRoomResponseDto> {
    return toCreateRoomResponse(await this.createRoom.execute());
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get a room by code' })
  @ApiOkResponse({ type: RoomResponseDto })
  async getByCode(@Param('code') code: string): Promise<RoomResponseDto> {
    return toRoomResponse(await this.lobby.getRoom(code));
  }

  @Get(':code/state')
  @ApiOperation({ summary: 'Get the full room state' })
  @ApiOkResponse({ type: RoomStateResponseDto })
  async getState(@Param('code') code: string): Promise<RoomStateResponseDto> {
    return toRoomStateResponse(await this.lobby.getRoomState(code));
  }

  @Get(':code/status')
  @ApiOperation({ summary: 'Get the room status' })
  @ApiOkResponse({ type: RoomStatusResponseDto })
  async getStatus(@Param('code') code: string): Promise<RoomStatusResponseDto> {
    return toRoomStatusResponse(await this.lobby.getRoom(code));
  }

  @Post(':code/host/reconnect')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Reconnect the host' })
  @ApiOkResponse({ type: RoomStateResponseDto })
  async reconnectHost(
    @CurrentHost() host: HostContext,
  ): Promise<RoomStateResponseDto> {
    return toRoomStateResponse(
      await this.reconnectClient.execute({
        roomId: host.roomId,
        principalHint: 'host',
      }),
    );
  }

  @Post(':code/close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Close the room' })
  @ApiOkResponse({ type: RoomResponseDto })
  async close(@CurrentHost() host: HostContext): Promise<RoomResponseDto> {
    return toRoomResponse(
      await this.closeRoom.execute({ roomId: host.roomId }),
    );
  }
}

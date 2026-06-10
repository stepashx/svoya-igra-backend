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
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import {
  AdvanceOnTimeoutUseCase,
  StartGameUseCase,
} from '../../application/use-cases';
import {
  RoomStateResponseDto,
  StageResponseDto,
  TeamResponseDto,
  TimerResponseDto,
} from '../dto/response';
import {
  CurrentHost,
  HOST_TOKEN_HEADER,
  HostAuthGuard,
  HostContext,
} from '../http';
import {
  toRoomStateResponse,
  toStageResponse,
  toTeamResponse,
  toTimerResponse,
} from '../mappers';

const NOT_IMPLEMENTED = 'Game finish arrives in a later stage.';

/**
 * Game-flow REST surface (plan §15.7), nested under a room. Sub-stage 5.2a
 * shipped game start plus the lobby/game read endpoints. Sub-stage 6.2a wires
 * the answer-timer read and the host timeout bridge (`advance`); `finish`
 * remains 501 (Stage 9).
 */
@ApiTags(SwaggerTag.GameSession)
@Controller('rooms/:code/game')
export class GameController {
  constructor(
    private readonly startGame: StartGameUseCase,
    private readonly advanceOnTimeout: AdvanceOnTimeoutUseCase,
    private readonly lobby: LobbyQueryService,
    private readonly timers: TimerQueryService,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Start the game' })
  @ApiOkResponse({ type: RoomStateResponseDto })
  async start(@CurrentHost() host: HostContext): Promise<RoomStateResponseDto> {
    return toRoomStateResponse(
      await this.startGame.execute({ roomId: host.roomId }),
    );
  }

  @Get('state')
  @ApiOperation({ summary: 'Get the overall game state' })
  @ApiOkResponse({ type: RoomStateResponseDto })
  async getState(@Param('code') code: string): Promise<RoomStateResponseDto> {
    return toRoomStateResponse(await this.lobby.getRoomState(code));
  }

  @Get('stage')
  @ApiOperation({ summary: 'Get the current stage' })
  @ApiOkResponse({ type: StageResponseDto })
  async getStage(@Param('code') code: string): Promise<StageResponseDto> {
    return toStageResponse(await this.lobby.getRoom(code));
  }

  @Get('active-team')
  @ApiOperation({ summary: 'Get the active team' })
  @ApiOkResponse({ type: TeamResponseDto })
  async getActiveTeam(
    @Param('code') code: string,
  ): Promise<TeamResponseDto | null> {
    const team = await this.lobby.getActiveTeam(code);
    return team ? toTeamResponse(team) : null;
  }

  @Get('timer')
  @ApiOperation({ summary: 'Get the answer timer state' })
  @ApiOkResponse({ type: TimerResponseDto })
  async getTimer(@Param('code') code: string): Promise<TimerResponseDto> {
    return toTimerResponse(await this.timers.read(code));
  }

  @Post('advance')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({
    summary: 'Advance past an expired answer timer (host timeout bridge)',
  })
  @ApiOkResponse({ type: StageResponseDto })
  async advance(@CurrentHost() host: HostContext): Promise<StageResponseDto> {
    const result = await this.advanceOnTimeout.execute({ roomId: host.roomId });
    return { currentStage: result.stage };
  }

  @Post('finish')
  @ApiOperation({ summary: 'Finish the game' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  finish(): never {
    throw new NotImplementedException();
  }
}

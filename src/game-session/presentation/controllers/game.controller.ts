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
import { ApiErrorResponses } from '../../../common/http/api-error-responses.decorator';
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

const NOT_IMPLEMENTED =
  'Not implemented — game completion is performed via POST /rooms/{code}/evaluation/results.';

/**
 * Game-flow REST surface (plan §15.7), nested under a room. Sub-stage 5.2a
 * shipped game start plus the lobby/game read endpoints. Sub-stage 6.2a wires
 * the answer-timer read and the host timeout bridge (`advance`). `finish` is a
 * deprecated 501 stub: game completion is performed via
 * `POST /rooms/{code}/evaluation/results` (Stage 10); the dead route is kept
 * only until its scheduled removal.
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
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async start(@CurrentHost() host: HostContext): Promise<RoomStateResponseDto> {
    return toRoomStateResponse(
      await this.startGame.execute({ roomId: host.roomId }),
    );
  }

  @Get('state')
  @ApiOperation({ summary: 'Get the overall game state' })
  @ApiOkResponse({ type: RoomStateResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getState(@Param('code') code: string): Promise<RoomStateResponseDto> {
    return toRoomStateResponse(await this.lobby.getRoomState(code));
  }

  @Get('stage')
  @ApiOperation({ summary: 'Get the current stage' })
  @ApiOkResponse({ type: StageResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getStage(@Param('code') code: string): Promise<StageResponseDto> {
    return toStageResponse(await this.lobby.getRoom(code));
  }

  @Get('active-team')
  @ApiOperation({ summary: 'Get the active team' })
  @ApiOkResponse({ type: TeamResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getActiveTeam(
    @Param('code') code: string,
  ): Promise<TeamResponseDto | null> {
    const team = await this.lobby.getActiveTeam(code);
    return team ? toTeamResponse(team) : null;
  }

  @Get('timer')
  @ApiOperation({ summary: 'Get the answer timer state' })
  @ApiOkResponse({ type: TimerResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
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
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async advance(@CurrentHost() host: HostContext): Promise<StageResponseDto> {
    const result = await this.advanceOnTimeout.execute({ roomId: host.roomId });
    return { currentStage: result.stage };
  }

  @Post('finish')
  @ApiOperation({
    summary: 'Finish the game',
    deprecated: true,
    description:
      'Game completion is performed via POST /rooms/{code}/evaluation/results — this endpoint is not implemented.',
  })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  finish(): never {
    throw new NotImplementedException();
  }
}

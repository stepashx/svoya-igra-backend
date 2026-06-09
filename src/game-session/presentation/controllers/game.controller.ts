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
import { LobbyQueryService } from '../../application/queries';
import { StartGameUseCase } from '../../application/use-cases';
import {
  RoomStateResponseDto,
  StageResponseDto,
  TeamResponseDto,
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
} from '../mappers';

const NOT_IMPLEMENTED = 'Gameplay flow arrives in a later sub-stage.';

/**
 * Game-flow REST surface (plan §15.7), nested under a room. Sub-stage 5.2a
 * implements game start plus the lobby/game read endpoints; the gameplay
 * controls (timer / advance / finish) remain 501 until later sub-stages.
 */
@ApiTags(SwaggerTag.GameSession)
@Controller('rooms/:code/game')
export class GameController {
  constructor(
    private readonly startGame: StartGameUseCase,
    private readonly lobby: LobbyQueryService,
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
  @ApiOperation({ summary: 'Get the timer state' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getTimer(): never {
    throw new NotImplementedException();
  }

  @Post('advance')
  @ApiOperation({ summary: 'Advance to the next stage' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  advance(): never {
    throw new NotImplementedException();
  }

  @Post('finish')
  @ApiOperation({ summary: 'Finish the game' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  finish(): never {
    throw new NotImplementedException();
  }
}

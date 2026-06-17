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
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../common/http/api-error-responses.decorator';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { LobbyQueryService } from '../../application/queries';
import {
  DefenseAdvanceResult,
  FinishPresentationUseCase,
  SkipPresenterUseCase,
  StartDefenseUseCase,
} from '../../application/use-cases';
import {
  DefenseAdvanceResponseDto,
  DefenseStateResponseDto,
} from '../dto/response';
import {
  CurrentHost,
  HOST_TOKEN_HEADER,
  HostAuthGuard,
  HostContext,
} from '../http';
import { toDefenseStateResponse } from '../mappers';

/**
 * Presentation-defense REST surface (plan §15.7, §10.16), nested under a room.
 * Design A: the routes live here because Game Flow owns the stages
 * (PRESENTATION_DEFENSE) and the active-team pointer that IS the current
 * presenter — there is no separate defense module and no defense table; the
 * whole state is DERIVED from `currentTeamId` + the teams' `turnOrder`.
 *
 * - `POST start` — the host opens the defenses (PRESENTATION_PREPARATION →
 *   PRESENTATION_DEFENSE, first presenter on). 200 (the host-action precedent).
 * - `POST finish-presenter` / `POST skip-presenter` — the host advances the
 *   queue; the last one moves the room on to EVALUATION.
 * - `GET state` — the public derived state (reconnect/refresh).
 *
 * The three mutations are host-only (HostAuthGuard); the read is open. Every
 * payload is public — the defense order/progress hides nothing (the opposite of
 * the §16.5 QR secrecy), so there is no team-gating here.
 */
@ApiTags(SwaggerTag.Defense)
@Controller('rooms/:code/defense')
export class DefenseController {
  constructor(
    private readonly startDefense: StartDefenseUseCase,
    private readonly finishPresentation: FinishPresentationUseCase,
    private readonly skipPresenter: SkipPresenterUseCase,
    private readonly lobby: LobbyQueryService,
  ) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Start the presentation defenses (host only)' })
  @ApiOkResponse({ type: DefenseStateResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async start(
    @CurrentHost() host: HostContext,
  ): Promise<DefenseStateResponseDto> {
    return toDefenseStateResponse(
      await this.startDefense.execute({ roomId: host.roomId }),
    );
  }

  @Post('finish-presenter')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Finish the current presenter (host only)' })
  @ApiOkResponse({ type: DefenseAdvanceResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async finish(
    @CurrentHost() host: HostContext,
  ): Promise<DefenseAdvanceResponseDto> {
    return this.toAdvanceResponse(
      await this.finishPresentation.execute({ roomId: host.roomId }),
    );
  }

  @Post('skip-presenter')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Skip the current presenter (host only)' })
  @ApiOkResponse({ type: DefenseAdvanceResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
  async skip(
    @CurrentHost() host: HostContext,
  ): Promise<DefenseAdvanceResponseDto> {
    return this.toAdvanceResponse(
      await this.skipPresenter.execute({ roomId: host.roomId }),
    );
  }

  @Get('state')
  @ApiOperation({ summary: 'Get the current defense state' })
  @ApiOkResponse({ type: DefenseStateResponseDto })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getState(
    @Param('code') code: string,
  ): Promise<DefenseStateResponseDto> {
    return toDefenseStateResponse(await this.lobby.getDefenseState(code));
  }

  /** Flatten a Finish/Skip advance result to its DTO (`stage` → `currentStage`). */
  private toAdvanceResponse(
    result: DefenseAdvanceResult,
  ): DefenseAdvanceResponseDto {
    return {
      currentStage: result.stage,
      currentPresenterTeamId: result.currentPresenterTeamId,
      finished: result.finished,
    };
  }
}

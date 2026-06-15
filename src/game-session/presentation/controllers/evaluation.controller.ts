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
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { EvaluationQueryService } from '../../../evaluation/application/queries';
import { LobbyQueryService } from '../../application/queries';
import {
  ConfirmEvaluationUseCase,
  SubmitEvaluationUseCase,
} from '../../application/use-cases';
import { Player } from '../../domain/entities';
import {
  ConfirmEvaluationRequestDto,
  SubmitEvaluationRequestDto,
} from '../dto/request';
import {
  ConfirmEvaluationResponseDto,
  CriterionResponseDto,
  EvaluationTargetResponseDto,
  ProgressResponseDto,
  SubmitEvaluationResponseDto,
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
  toConfirmEvaluationResponse,
  toCriterionResponse,
  toEvaluationTargetResponse,
  toProgressResponse,
  toSubmitEvaluationResponse,
} from '../mappers';

/**
 * Evaluation REST surface (plan §15.11), nested under a room. Design A: the
 * routes live here because Game Flow owns the EVALUATION stage; the scores +
 * progress come from the evaluation-exported {@link EvaluationQueryService} and
 * the Submit/Confirm use cases. Sub-stage 10.2 ships collection only —
 * aggregation/places (10.3) add no route here.
 *
 * - `GET criteria` / `GET teams` / `GET progress` — public reads. `progress` is
 *   counts-only (§16.8 secrecy).
 * - `POST team` / `POST team/confirm` — a team captain (PlayerIdentityGuard).
 * - `POST host` / `POST host/confirm` — the host (HostAuthGuard).
 *
 * The captain/host split is two SEPARATE guarded endpoints (AND, not an OR
 * guard): the evaluator is taken from the guard-resolved principal, NEVER the
 * body. The author's own numbers come back ONLY in the POST reply — there is NO
 * GET for another evaluator's scores until results (10.3).
 */
@ApiTags(SwaggerTag.Evaluation)
@Controller('rooms/:code/evaluation')
export class EvaluationController {
  constructor(
    private readonly submitEvaluation: SubmitEvaluationUseCase,
    private readonly confirmEvaluation: ConfirmEvaluationUseCase,
    private readonly evaluationQuery: EvaluationQueryService,
    private readonly lobby: LobbyQueryService,
  ) {}

  @Get('criteria')
  @ApiOperation({ summary: 'List the evaluation criteria (public)' })
  @ApiOkResponse({ type: [CriterionResponseDto] })
  async listCriteria(): Promise<CriterionResponseDto[]> {
    const criteria = await this.evaluationQuery.listCriteria();
    return criteria.map(toCriterionResponse);
  }

  @Get('teams')
  @ApiOperation({ summary: 'List the teams to evaluate (public)' })
  @ApiOkResponse({ type: [EvaluationTargetResponseDto] })
  async listTeams(
    @Param('code') code: string,
  ): Promise<EvaluationTargetResponseDto[]> {
    const teams = await this.lobby.listTeamsToEvaluate(code);
    return teams.map(toEvaluationTargetResponse);
  }

  @Get('progress')
  @ApiOperation({
    summary: 'Get the evaluation progress (counts only, public)',
  })
  @ApiOkResponse({ type: ProgressResponseDto })
  async getProgress(@Param('code') code: string): Promise<ProgressResponseDto> {
    const room = await this.lobby.getRoom(code);
    const teams = await this.lobby.listTeams(code);
    const teamCount = teams.filter(
      (team) => team.captainPlayerId !== null,
    ).length;
    return toProgressResponse(
      await this.evaluationQuery.getProgress(room.id, teamCount),
    );
  }

  @Post('team')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Submit an evaluation (team captain only)' })
  @ApiOkResponse({ type: SubmitEvaluationResponseDto })
  async submitTeam(
    @CurrentPlayer() player: Player,
    @Body() body: SubmitEvaluationRequestDto,
  ): Promise<SubmitEvaluationResponseDto> {
    return toSubmitEvaluationResponse(
      await this.submitEvaluation.execute({
        roomId: player.roomId,
        targetTeamId: body.targetTeamId,
        topicScore: body.topicScore,
        designScore: body.designScore,
        evaluator: { type: 'TEAM', actingPlayerId: player.id },
      }),
    );
  }

  @Post('host')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Submit an evaluation (host only)' })
  @ApiOkResponse({ type: SubmitEvaluationResponseDto })
  async submitHost(
    @CurrentHost() host: HostContext,
    @Body() body: SubmitEvaluationRequestDto,
  ): Promise<SubmitEvaluationResponseDto> {
    return toSubmitEvaluationResponse(
      await this.submitEvaluation.execute({
        roomId: host.roomId,
        targetTeamId: body.targetTeamId,
        topicScore: body.topicScore,
        designScore: body.designScore,
        evaluator: { type: 'HOST' },
      }),
    );
  }

  @Post('team/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Confirm evaluation(s) (team captain only)' })
  @ApiOkResponse({ type: ConfirmEvaluationResponseDto })
  async confirmTeam(
    @CurrentPlayer() player: Player,
    @Body() body: ConfirmEvaluationRequestDto,
  ): Promise<ConfirmEvaluationResponseDto> {
    return toConfirmEvaluationResponse(
      await this.confirmEvaluation.execute({
        roomId: player.roomId,
        evaluator: { type: 'TEAM', actingPlayerId: player.id },
        targetTeamId: body.targetTeamId,
      }),
    );
  }

  @Post('host/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Confirm evaluation(s) (host only)' })
  @ApiOkResponse({ type: ConfirmEvaluationResponseDto })
  async confirmHost(
    @CurrentHost() host: HostContext,
    @Body() body: ConfirmEvaluationRequestDto,
  ): Promise<ConfirmEvaluationResponseDto> {
    return toConfirmEvaluationResponse(
      await this.confirmEvaluation.execute({
        roomId: host.roomId,
        evaluator: { type: 'HOST' },
        targetTeamId: body.targetTeamId,
      }),
    );
  }
}

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Param,
  Post,
  Put,
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
import { PresentationQueryService } from '../../../presentation/application/queries';
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import { StartPresentationPreparationUseCase } from '../../application/use-cases';
import {
  PresentationDeadlineResponseDto,
  PresentationRequirementResponseDto,
  PresentationSubmissionStatusResponseDto,
} from '../dto/response';
import {
  CurrentHost,
  HOST_TOKEN_HEADER,
  HostAuthGuard,
  HostContext,
} from '../http';
import {
  toPresentationDeadlineResponse,
  toPresentationRequirementResponse,
  toPresentationSubmissionStatusResponse,
} from '../mappers';

const NOT_IMPLEMENTED_93 =
  'Presentation upload / replace / files arrive in sub-stage 9.3.';

/**
 * Presentation REST surface (plan §15.10), nested under a room. Design A: the
 * routes live here because Game Flow owns the stages (PRESENTATION_PREPARATION)
 * while the requirement/submission reads come from the presentation-exported
 * {@link PresentationQueryService}.
 *
 * Sub-stage 9.2 wires the preparation surface on top of the 9.1 `GET
 * requirements`: the host opens preparation (`POST start-preparation`, the first
 * §16.6 emitter — `preparation-started` + `timer-started`), and the public reads
 * `GET deadline` (the {@link PresentationTimerRegistry} state) and `GET
 * submissions` (per-team upload status, empty until 9.3). `POST upload` / `PUT
 * upload` (replace) / `GET files` stay 501 (9.3).
 *
 * Presentation files are PUBLIC (Этап2 §10.15): a team's file is seen by the
 * host and the other teams, so these reads carry no secrecy — the opposite of
 * the §16.5 QR contract. No R3-style gating is applied here.
 */
@ApiTags(SwaggerTag.Presentation)
@Controller('rooms/:code/presentation')
export class PresentationController {
  constructor(
    private readonly presentationQuery: PresentationQueryService,
    private readonly lobby: LobbyQueryService,
    private readonly timers: TimerQueryService,
    private readonly startPresentationPreparation: StartPresentationPreparationUseCase,
  ) {}

  @Get('requirements')
  @ApiOperation({
    summary: 'List the presentation requirements (global catalog)',
  })
  @ApiOkResponse({ type: [PresentationRequirementResponseDto] })
  async listRequirements(
    @Param('code') code: string,
  ): Promise<PresentationRequirementResponseDto[]> {
    // Validate the room exists (404-consistency with the nested routes); the
    // requirements catalog itself is global, not room-scoped.
    await this.lobby.getRoom(code);
    const requirements = await this.presentationQuery.listRequirements();
    return requirements.map(toPresentationRequirementResponse);
  }

  @Get('deadline')
  @ApiOperation({ summary: 'Get the preparation deadline / endsAt' })
  @ApiOkResponse({ type: PresentationDeadlineResponseDto })
  async getDeadline(
    @Param('code') code: string,
  ): Promise<PresentationDeadlineResponseDto> {
    // 404 (unknown room) is raised inside readPresentation (resolveRoom).
    return toPresentationDeadlineResponse(
      await this.timers.readPresentation(code),
    );
  }

  @Post('start-preparation')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({
    summary: 'Start the presentation preparation timer (host only)',
  })
  @ApiOkResponse({ type: PresentationDeadlineResponseDto })
  async startPreparation(
    @CurrentHost() host: HostContext,
  ): Promise<PresentationDeadlineResponseDto> {
    const result = await this.startPresentationPreparation.execute({
      roomId: host.roomId,
    });
    return toPresentationDeadlineResponse(result.timer);
  }

  @Get('submissions')
  @ApiOperation({ summary: "Get the teams' upload status" })
  @ApiOkResponse({ type: [PresentationSubmissionStatusResponseDto] })
  async getSubmissions(
    @Param('code') code: string,
  ): Promise<PresentationSubmissionStatusResponseDto[]> {
    const room = await this.lobby.getRoom(code);
    const submissions = await this.presentationQuery.listSubmissions(room.id);
    return submissions.map(toPresentationSubmissionStatusResponse);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a presentation file (team captain only)' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED_93 })
  upload(): never {
    throw new NotImplementedException();
  }

  @Put('upload')
  @ApiOperation({ summary: 'Replace a presentation file (team captain only)' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED_93 })
  replace(): never {
    throw new NotImplementedException();
  }

  @Get('files')
  @ApiOperation({ summary: 'List the presentation files (public links)' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED_93 })
  getFiles(): never {
    throw new NotImplementedException();
  }
}

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from '../../../common/http/api-error-responses.decorator';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { PresentationQueryService } from '../../../presentation/application/queries';
import {
  LobbyQueryService,
  TimerQueryService,
} from '../../application/queries';
import {
  StartPresentationPreparationUseCase,
  UploadPresentationUseCase,
} from '../../application/use-cases';
import { Player } from '../../domain/entities';
import {
  PresentationDeadlineResponseDto,
  PresentationFileResponseDto,
  PresentationRequirementResponseDto,
  PresentationSubmissionStatusResponseDto,
  PresentationUploadResultResponseDto,
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
  toPresentationDeadlineResponse,
  toPresentationFileResponse,
  toPresentationRequirementResponse,
  toPresentationSubmissionStatusResponse,
  toPresentationUploadResultResponse,
} from '../mappers';

/**
 * Presentation REST surface (plan §15.10), nested under a room. Design A: the
 * routes live here because Game Flow owns the stages (PRESENTATION_PREPARATION)
 * while the requirement/submission reads come from the presentation-exported
 * {@link PresentationQueryService}.
 *
 * Sub-stage 9.3 completes the surface on top of the 9.2 preparation reads:
 *
 * - `POST upload` / `PUT upload` — a team captain uploads (first) or replaces
 *   their team's file. ONE {@link UploadPresentationUseCase} (upsert) backs
 *   both verbs; the verb is cosmetic. PlayerIdentityGuard for coarse authn
 *   (the use case enforces captaincy); 200 (the POST-mutation precedent); the
 *   multipart `file` part is parsed in-memory by the module Multer config.
 * - `GET files` — the public room file catalog (the SAME projection as the
 *   `files-updated` broadcast).
 * - `GET submissions` — now carries the richer file metadata (9.3, additive).
 *
 * Presentation files are PUBLIC (Этап2 §10.15): a team's file is seen by the
 * host and the other teams, so these reads/replies carry no secrecy — the
 * opposite of the §16.5 QR contract. No R3-style gating is applied here.
 */
@ApiTags(SwaggerTag.Presentation)
@Controller('rooms/:code/presentation')
export class PresentationController {
  constructor(
    private readonly presentationQuery: PresentationQueryService,
    private readonly lobby: LobbyQueryService,
    private readonly timers: TimerQueryService,
    private readonly startPresentationPreparation: StartPresentationPreparationUseCase,
    private readonly uploadPresentation: UploadPresentationUseCase,
  ) {}

  @Get('requirements')
  @ApiOperation({
    summary: 'List the presentation requirements (global catalog)',
  })
  @ApiOkResponse({ type: [PresentationRequirementResponseDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
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
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
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
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
  )
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
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getSubmissions(
    @Param('code') code: string,
  ): Promise<PresentationSubmissionStatusResponseDto[]> {
    const room = await this.lobby.getRoom(code);
    const submissions = await this.presentationQuery.listSubmissions(room.id);
    return submissions.map(toPresentationSubmissionStatusResponse);
  }

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayerIdentityGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Upload a presentation file (team captain only)' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Presentation file. Allowed extensions from GET …/presentation/requirements; over-size→413, unsupported/missing→400.',
        },
      },
    },
  })
  @ApiOkResponse({ type: PresentationUploadResultResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
    HttpStatus.PAYLOAD_TOO_LARGE,
  )
  async upload(
    @CurrentPlayer() player: Player,
    @UploadedFile(
      new ParseFilePipe({
        validators: [],
        fileIsRequired: true,
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      }),
    )
    file: Express.Multer.File,
  ): Promise<PresentationUploadResultResponseDto> {
    return this.runUpload(player, file);
  }

  @Put('upload')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayerIdentityGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Replace a presentation file (team captain only)' })
  @ApiBody({
    required: true,
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Presentation file. Allowed extensions from GET …/presentation/requirements; over-size→413, unsupported/missing→400.',
        },
      },
    },
  })
  @ApiOkResponse({ type: PresentationUploadResultResponseDto })
  @ApiErrorResponses(
    HttpStatus.BAD_REQUEST,
    HttpStatus.UNAUTHORIZED,
    HttpStatus.FORBIDDEN,
    HttpStatus.NOT_FOUND,
    HttpStatus.CONFLICT,
    HttpStatus.PAYLOAD_TOO_LARGE,
  )
  async replace(
    @CurrentPlayer() player: Player,
    @UploadedFile(
      new ParseFilePipe({
        validators: [],
        fileIsRequired: true,
        errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      }),
    )
    file: Express.Multer.File,
  ): Promise<PresentationUploadResultResponseDto> {
    return this.runUpload(player, file);
  }

  @Get('files')
  @ApiOperation({ summary: 'List the presentation files (public links)' })
  @ApiOkResponse({ type: [PresentationFileResponseDto] })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async getFiles(
    @Param('code') code: string,
  ): Promise<PresentationFileResponseDto[]> {
    const room = await this.lobby.getRoom(code);
    const submissions = await this.presentationQuery.listSubmissions(room.id);
    return submissions.map(toPresentationFileResponse);
  }

  /** Shared upsert path for the POST (first) and PUT (replace) upload routes. */
  private async runUpload(
    player: Player,
    file: Express.Multer.File,
  ): Promise<PresentationUploadResultResponseDto> {
    const result = await this.uploadPresentation.execute({
      roomId: player.roomId,
      actingPlayerId: player.id,
      file: {
        originalFileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        buffer: file.buffer,
      },
    });
    return toPresentationUploadResultResponse(result);
  }
}

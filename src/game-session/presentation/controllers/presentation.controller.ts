import {
  Controller,
  Get,
  NotImplementedException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { PresentationQueryService } from '../../../presentation/application/queries';
import { LobbyQueryService } from '../../application/queries';
import { PresentationRequirementResponseDto } from '../dto/response';
import { toPresentationRequirementResponse } from '../mappers';

const NOT_IMPLEMENTED_92 =
  'Presentation preparation (deadline / team upload status) arrives in sub-stage 9.2.';
const NOT_IMPLEMENTED_93 =
  'Presentation upload / replace / files arrive in sub-stage 9.3.';

/**
 * Presentation REST surface (plan §15.10), nested under a room. Design A: the
 * routes live here because Game Flow owns the stages (PRESENTATION_PREPARATION)
 * while the requirement/submission reads come from the presentation-exported
 * {@link PresentationQueryService}.
 *
 * Sub-stage 9.1 wires the real `GET requirements` (the global, seed-managed
 * catalog; room-existence validated for 404-consistency with the other nested
 * routes) and reserves the rest as 501 stubs: `GET deadline` /
 * `GET submissions` (9.2) and `POST upload` / `PUT upload` (replace) /
 * `GET files` (9.3). Guards land WITH the real implementations.
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
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED_92 })
  getDeadline(): never {
    throw new NotImplementedException();
  }

  @Get('submissions')
  @ApiOperation({ summary: "Get the teams' upload status" })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED_92 })
  getSubmissions(): never {
    throw new NotImplementedException();
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

import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';

const NOT_IMPLEMENTED = 'Question read endpoints arrive in sub-stage 6.2.';

/**
 * Question read surface (plan §15.6, Этап2 §8), nested under a room. Sub-stage
 * 6.1 ships the routes as 501 stubs.
 *
 * DTO boundary (implemented in 6.2): the room-facing view of the current
 * question MUST omit `correctAnswer`, while the host views expose it. Concretely
 * `GET current` (room-view) returns no answer; `GET current/host` (host-view)
 * and `GET current/answer` (host-only) include it, behind the host guard. The
 * domain {@link Question} holds the answer; these endpoints decide who sees it —
 * no answer field ever reaches the room-view DTO.
 */
@ApiTags(SwaggerTag.Gameplay)
@Controller('rooms/:code/questions')
export class QuestionsController {
  @Get('current')
  @ApiOperation({ summary: 'Get the current question (room view, no answer)' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getCurrent(): never {
    throw new NotImplementedException();
  }

  @Get('current/host')
  @ApiOperation({
    summary: 'Get the current question (host view, with answer)',
  })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getCurrentForHost(): never {
    throw new NotImplementedException();
  }

  @Get('current/answer')
  @ApiOperation({ summary: 'Get the current question answer (host only)' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getCurrentAnswer(): never {
    throw new NotImplementedException();
  }

  @Get()
  @ApiOperation({ summary: 'List the room questions' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  list(): never {
    throw new NotImplementedException();
  }
}

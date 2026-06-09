import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';

const NOT_IMPLEMENTED = 'Not implemented yet — arrives in sub-stage 5.2.';

/**
 * Topics REST surface (plan §15.4). Two paths — the global catalog and the
 * room-scoped availability view — so the controller has no shared base path.
 * Sub-stage 5.1 ships route stubs only: every handler returns 501. No DTOs yet.
 */
@ApiTags(SwaggerTag.GameSession)
@Controller()
export class TopicsController {
  @Get('topics')
  @ApiOperation({ summary: 'List the global topic catalog' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getAll(): never {
    throw new NotImplementedException();
  }

  @Get('rooms/:code/topics')
  @ApiOperation({ summary: 'List topics with room availability' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getRoomTopics(): never {
    throw new NotImplementedException();
  }
}

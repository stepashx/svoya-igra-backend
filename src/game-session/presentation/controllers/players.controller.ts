import { Controller, Get, NotImplementedException, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';

const NOT_IMPLEMENTED = 'Not implemented yet — arrives in sub-stage 5.2.';

/**
 * Players REST surface (plan §15.2), nested under a room. Sub-stage 5.1 ships
 * route stubs only: every handler returns 501. No DTOs yet.
 */
@ApiTags(SwaggerTag.GameSession)
@Controller('rooms/:code/players')
export class PlayersController {
  @Post()
  @ApiOperation({ summary: 'Join the room as a player' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  create(): never {
    throw new NotImplementedException();
  }

  @Get()
  @ApiOperation({ summary: 'List players in the room' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  list(): never {
    throw new NotImplementedException();
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current player' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getMe(): never {
    throw new NotImplementedException();
  }

  @Post('reconnect')
  @ApiOperation({ summary: 'Reconnect a player by reconnect token' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  reconnect(): never {
    throw new NotImplementedException();
  }
}

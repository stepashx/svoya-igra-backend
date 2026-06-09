import { Controller, Get, NotImplementedException, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';

const NOT_IMPLEMENTED = 'Not implemented yet — arrives in sub-stage 5.2.';

/**
 * Game-flow REST surface (plan §15.7), nested under a room. Sub-stage 5.1 ships
 * route stubs only: every handler returns 501. No DTOs yet.
 */
@ApiTags(SwaggerTag.GameSession)
@Controller('rooms/:code/game')
export class GameController {
  @Post('start')
  @ApiOperation({ summary: 'Start the game' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  start(): never {
    throw new NotImplementedException();
  }

  @Get('state')
  @ApiOperation({ summary: 'Get the overall game state' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getState(): never {
    throw new NotImplementedException();
  }

  @Get('stage')
  @ApiOperation({ summary: 'Get the current stage' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getStage(): never {
    throw new NotImplementedException();
  }

  @Get('active-team')
  @ApiOperation({ summary: 'Get the active team' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getActiveTeam(): never {
    throw new NotImplementedException();
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

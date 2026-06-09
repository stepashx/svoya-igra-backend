import { Controller, Get, NotImplementedException } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';

const NOT_IMPLEMENTED = 'Board read endpoints arrive in sub-stage 6.2.';

/**
 * Board read surface (plan §15.5), nested under a room. Sub-stage 6.1 ships the
 * routes as 501 stubs: the board itself is materialised in the database at game
 * start (board-init), but its read models, DTOs and query service land with the
 * combat sub-stage. No guards or DTOs here yet.
 */
@ApiTags(SwaggerTag.Gameplay)
@Controller('rooms/:code/board')
export class BoardController {
  @Get()
  @ApiOperation({ summary: 'Get the full board' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getBoard(): never {
    throw new NotImplementedException();
  }

  @Get('categories')
  @ApiOperation({ summary: 'List the board categories' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getCategories(): never {
    throw new NotImplementedException();
  }

  @Get('cells')
  @ApiOperation({ summary: 'List the board cells' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getCells(): never {
    throw new NotImplementedException();
  }

  @Get('active-cell')
  @ApiOperation({ summary: 'Get the active (selected/opened) cell' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getActiveCell(): never {
    throw new NotImplementedException();
  }
}

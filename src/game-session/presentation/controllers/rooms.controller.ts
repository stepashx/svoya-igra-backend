import { Controller, Get, NotImplementedException, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';

const NOT_IMPLEMENTED = 'Not implemented yet — arrives in sub-stage 5.2.';

/**
 * Rooms REST surface (plan §15.1). Sub-stage 5.1 ships route stubs only: every
 * handler returns 501 until the lobby use cases land in 5.2. No DTOs yet.
 */
@ApiTags(SwaggerTag.GameSession)
@Controller('rooms')
export class RoomsController {
  @Post()
  @ApiOperation({ summary: 'Create a room' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  create(): never {
    throw new NotImplementedException();
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get a room by code' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getByCode(): never {
    throw new NotImplementedException();
  }

  @Get(':code/state')
  @ApiOperation({ summary: 'Get the full room state' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getState(): never {
    throw new NotImplementedException();
  }

  @Get(':code/status')
  @ApiOperation({ summary: 'Get the room status' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getStatus(): never {
    throw new NotImplementedException();
  }

  @Post(':code/host/reconnect')
  @ApiOperation({ summary: 'Reconnect the host' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  reconnectHost(): never {
    throw new NotImplementedException();
  }

  @Post(':code/close')
  @ApiOperation({ summary: 'Close the room' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  close(): never {
    throw new NotImplementedException();
  }
}

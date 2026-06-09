import {
  Controller,
  Get,
  NotImplementedException,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';

const NOT_IMPLEMENTED = 'Not implemented yet — arrives in sub-stage 5.2.';

/**
 * Teams REST surface (plan §15.3), nested under a room. Sub-stage 5.1 ships
 * route stubs only: every handler returns 501. No DTOs yet.
 */
@ApiTags(SwaggerTag.GameSession)
@Controller('rooms/:code/teams')
export class TeamsController {
  @Post()
  @ApiOperation({ summary: 'Create a team' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  create(): never {
    throw new NotImplementedException();
  }

  @Get()
  @ApiOperation({ summary: 'List teams in the room' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  list(): never {
    throw new NotImplementedException();
  }

  @Get(':teamId')
  @ApiOperation({ summary: 'Get a team with its members' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getById(): never {
    throw new NotImplementedException();
  }

  @Post(':teamId/members')
  @ApiOperation({ summary: 'Join a team' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  addMember(): never {
    throw new NotImplementedException();
  }

  @Patch(':teamId/topic')
  @ApiOperation({ summary: 'Select the team topic' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  selectTopic(): never {
    throw new NotImplementedException();
  }

  @Patch(':teamId/ready')
  @ApiOperation({ summary: 'Set the team readiness' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  setReady(): never {
    throw new NotImplementedException();
  }

  @Get(':teamId/captain')
  @ApiOperation({ summary: 'Get the team captain' })
  @ApiResponse({ status: 501, description: NOT_IMPLEMENTED })
  getCaptain(): never {
    throw new NotImplementedException();
  }
}

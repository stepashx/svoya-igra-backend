import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { LobbyQueryService } from '../../application/queries';
import { RoomTopicResponseDto, TopicResponseDto } from '../dto/response';
import { toRoomTopicResponse, toTopicResponse } from '../mappers';

/**
 * Topics REST surface (plan §15.4). Two paths — the global catalog and the
 * room-scoped availability view — so the controller has no shared base path.
 */
@ApiTags(SwaggerTag.GameSession)
@Controller()
export class TopicsController {
  constructor(private readonly lobby: LobbyQueryService) {}

  @Get('topics')
  @ApiOperation({ summary: 'List the global topic catalog' })
  @ApiOkResponse({ type: [TopicResponseDto] })
  async getAll(): Promise<TopicResponseDto[]> {
    const topics = await this.lobby.listTopics();
    return topics.map(toTopicResponse);
  }

  @Get('rooms/:code/topics')
  @ApiOperation({ summary: 'List topics with room availability' })
  @ApiOkResponse({ type: [RoomTopicResponseDto] })
  async getRoomTopics(
    @Param('code') code: string,
  ): Promise<RoomTopicResponseDto[]> {
    const availability = await this.lobby.getRoomTopics(code);
    return availability.map(toRoomTopicResponse);
  }
}

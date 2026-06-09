import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { LobbyQueryService } from '../../application/queries';
import {
  CreateTeamUseCase,
  JoinTeamUseCase,
  LeaveTeamUseCase,
  MarkTeamReadyUseCase,
  SelectTopicUseCase,
} from '../../application/use-cases';
import { Player } from '../../domain/entities';
import {
  CreateTeamRequestDto,
  SelectTopicRequestDto,
  SetReadyRequestDto,
} from '../dto/request';
import {
  PlayerResponseDto,
  TeamResponseDto,
  TeamWithMembersResponseDto,
} from '../dto/response';
import {
  CurrentPlayer,
  PLAYER_TOKEN_HEADER,
  PlayerIdentityGuard,
} from '../http';
import {
  toPlayerResponse,
  toTeamResponse,
  toTeamWithMembersResponse,
} from '../mappers';

/** Teams REST surface (plan §15.3), nested under a room. */
@ApiTags(SwaggerTag.GameSession)
@Controller('rooms/:code/teams')
export class TeamsController {
  constructor(
    private readonly createTeam: CreateTeamUseCase,
    private readonly joinTeam: JoinTeamUseCase,
    private readonly leaveTeam: LeaveTeamUseCase,
    private readonly selectTopic: SelectTopicUseCase,
    private readonly markReady: MarkTeamReadyUseCase,
    private readonly lobby: LobbyQueryService,
  ) {}

  @Post()
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Create a team' })
  @ApiCreatedResponse({ type: TeamResponseDto })
  async create(
    @CurrentPlayer() player: Player,
    @Body() dto: CreateTeamRequestDto,
  ): Promise<TeamResponseDto> {
    const team = await this.createTeam.execute({
      roomId: player.roomId,
      actingPlayerId: player.id,
      name: dto.name,
    });
    return toTeamResponse(team);
  }

  @Get()
  @ApiOperation({ summary: 'List teams in the room' })
  @ApiOkResponse({ type: [TeamResponseDto] })
  async list(@Param('code') code: string): Promise<TeamResponseDto[]> {
    const teams = await this.lobby.listTeams(code);
    return teams.map(toTeamResponse);
  }

  @Get(':teamId')
  @ApiOperation({ summary: 'Get a team with its members' })
  @ApiOkResponse({ type: TeamWithMembersResponseDto })
  async getById(
    @Param('code') code: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ): Promise<TeamWithMembersResponseDto> {
    const { team, members } = await this.lobby.getTeamWithMembers(code, teamId);
    return toTeamWithMembersResponse(team, members);
  }

  @Post(':teamId/members')
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Join a team' })
  @ApiCreatedResponse({ type: PlayerResponseDto })
  async addMember(
    @CurrentPlayer() player: Player,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ): Promise<PlayerResponseDto> {
    const joined = await this.joinTeam.execute({
      roomId: player.roomId,
      teamId,
      actingPlayerId: player.id,
    });
    return toPlayerResponse(joined);
  }

  @Delete(':teamId/members/me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Leave a team' })
  @ApiOkResponse({ type: PlayerResponseDto })
  async removeMember(
    @CurrentPlayer() player: Player,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ): Promise<PlayerResponseDto> {
    const left = await this.leaveTeam.execute({
      roomId: player.roomId,
      teamId,
      actingPlayerId: player.id,
    });
    return toPlayerResponse(left);
  }

  @Patch(':teamId/topic')
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Select the team topic' })
  @ApiOkResponse({ type: TeamResponseDto })
  async selectTeamTopic(
    @CurrentPlayer() player: Player,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: SelectTopicRequestDto,
  ): Promise<TeamResponseDto> {
    const team = await this.selectTopic.execute({
      roomId: player.roomId,
      teamId,
      actingPlayerId: player.id,
      topicId: dto.topicId,
    });
    return toTeamResponse(team);
  }

  @Patch(':teamId/ready')
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Set the team readiness' })
  @ApiOkResponse({ type: TeamResponseDto })
  async setReady(
    @CurrentPlayer() player: Player,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Body() dto: SetReadyRequestDto,
  ): Promise<TeamResponseDto> {
    const team = await this.markReady.execute({
      roomId: player.roomId,
      teamId,
      actingPlayerId: player.id,
      isReady: dto.isReady,
    });
    return toTeamResponse(team);
  }

  @Get(':teamId/captain')
  @ApiOperation({ summary: 'Get the team captain' })
  @ApiOkResponse({ type: PlayerResponseDto })
  async getCaptain(
    @Param('code') code: string,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ): Promise<PlayerResponseDto | null> {
    const captain = await this.lobby.getTeamCaptain(code, teamId);
    return captain ? toPlayerResponse(captain) : null;
  }
}

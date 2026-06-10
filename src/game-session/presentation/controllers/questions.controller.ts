import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SwaggerTag } from '../../../swagger/swagger.tags';
import { BoardQueryService } from '../../../gameplay/application/queries';
import { LobbyQueryService } from '../../application/queries';
import {
  OpenQuestionUseCase,
  RejectSelectionUseCase,
  ReviewAnswerUseCase,
  SubmitAnswerUseCase,
} from '../../application/use-cases';
import { Player } from '../../domain/entities';
import {
  CellRefRequestDto,
  ReviewAnswerRequestDto,
  SubmitAnswerRequestDto,
} from '../dto/request';
import {
  BoardResponseDto,
  CellResponseDto,
  CurrentAnswerResponseDto,
  HostQuestionResponseDto,
  OpenQuestionResponseDto,
  RoomQuestionResponseDto,
  SubmitAnswerResponseDto,
} from '../dto/response';
import {
  CurrentHost,
  CurrentPlayer,
  HOST_TOKEN_HEADER,
  HostAuthGuard,
  HostContext,
  PLAYER_TOKEN_HEADER,
  PlayerIdentityGuard,
} from '../http';
import {
  toBoardResponse,
  toCellResponse,
  toHostQuestionResponse,
  toRoomQuestionResponse,
  toTimerResponse,
} from '../mappers';

/**
 * Questions REST surface (plan §15.6 / §16.4), nested under a room. Enforces the
 * answer-secrecy boundary: `current` (and the list) are room-facing and omit
 * `correctAnswer`; `current/host` and `current/answer` expose it only behind the
 * host guard. The host opens/rejects/reviews; the active team captain answers.
 * Owned by game-session per Design A.
 */
@ApiTags(SwaggerTag.Gameplay)
@Controller('rooms/:code/questions')
export class QuestionsController {
  constructor(
    private readonly boardQuery: BoardQueryService,
    private readonly lobby: LobbyQueryService,
    private readonly openQuestion: OpenQuestionUseCase,
    private readonly rejectSelection: RejectSelectionUseCase,
    private readonly submitAnswer: SubmitAnswerUseCase,
    private readonly reviewAnswer: ReviewAnswerUseCase,
  ) {}

  @Get('current')
  @ApiOperation({ summary: 'Get the current question (room view, no answer)' })
  @ApiOkResponse({ type: RoomQuestionResponseDto })
  async getCurrent(
    @Param('code') code: string,
  ): Promise<RoomQuestionResponseDto | null> {
    const room = await this.lobby.getRoom(code);
    const question = await this.boardQuery.getCurrentQuestion(room.id);
    return question ? toRoomQuestionResponse(question) : null;
  }

  @Get('current/host')
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({
    summary: 'Get the current question (host view, with answer)',
  })
  @ApiOkResponse({ type: HostQuestionResponseDto })
  async getCurrentForHost(
    @CurrentHost() host: HostContext,
  ): Promise<HostQuestionResponseDto | null> {
    const question = await this.boardQuery.getCurrentQuestion(host.roomId);
    return question ? toHostQuestionResponse(question) : null;
  }

  @Get('current/answer')
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Get the current question answer (host only)' })
  @ApiOkResponse({ type: CurrentAnswerResponseDto })
  async getCurrentAnswer(
    @CurrentHost() host: HostContext,
  ): Promise<CurrentAnswerResponseDto> {
    const question = await this.boardQuery.getCurrentQuestion(host.roomId);
    return { correctAnswer: question ? question.correctAnswer : null };
  }

  @Get()
  @ApiOperation({ summary: 'List the questions (room view, no answer)' })
  @ApiOkResponse({ type: [RoomQuestionResponseDto] })
  async list(): Promise<RoomQuestionResponseDto[]> {
    const questions = await this.boardQuery.listQuestions();
    return questions.map(toRoomQuestionResponse);
  }

  @Post('open')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Open the selected question (host)' })
  @ApiOkResponse({ type: OpenQuestionResponseDto })
  async open(
    @CurrentHost() host: HostContext,
    @Body() dto: CellRefRequestDto,
  ): Promise<OpenQuestionResponseDto> {
    const result = await this.openQuestion.execute({
      roomId: host.roomId,
      cellId: dto.cellId,
    });
    return {
      question: toHostQuestionResponse(result.question),
      timer: toTimerResponse(result.timer),
    };
  }

  @Post('reject')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Reject the selected cell (host)' })
  @ApiOkResponse({ type: CellResponseDto })
  async reject(
    @CurrentHost() host: HostContext,
    @Body() dto: CellRefRequestDto,
  ): Promise<CellResponseDto> {
    const cell = await this.rejectSelection.execute({
      roomId: host.roomId,
      cellId: dto.cellId,
    });
    return toCellResponse(cell);
  }

  @Post('answer')
  @HttpCode(HttpStatus.OK)
  @UseGuards(PlayerIdentityGuard)
  @ApiHeader({ name: PLAYER_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Submit an answer (active team captain)' })
  @ApiOkResponse({ type: SubmitAnswerResponseDto })
  async answer(
    @CurrentPlayer() player: Player,
    @Body() dto: SubmitAnswerRequestDto,
  ): Promise<SubmitAnswerResponseDto> {
    const result = await this.submitAnswer.execute({
      roomId: player.roomId,
      actingPlayerId: player.id,
      answer: dto.answer,
    });
    return {
      stage: result.stage,
      question: toRoomQuestionResponse(result.question),
    };
  }

  @Post('review')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HostAuthGuard)
  @ApiHeader({ name: HOST_TOKEN_HEADER, required: true })
  @ApiOperation({ summary: 'Review the submitted answer (host)' })
  @ApiOkResponse({ type: BoardResponseDto })
  async review(
    @CurrentHost() host: HostContext,
    @Body() dto: ReviewAnswerRequestDto,
  ): Promise<BoardResponseDto> {
    await this.reviewAnswer.execute({
      roomId: host.roomId,
      accepted: dto.accepted,
      revealAnswer: dto.revealAnswer,
    });
    return toBoardResponse(await this.boardQuery.getBoard(host.roomId));
  }
}

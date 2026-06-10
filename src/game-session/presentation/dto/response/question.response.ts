import { ApiProperty } from '@nestjs/swagger';
import { TimerResponseDto } from './timer.response';

/**
 * Room-facing view of a question (plan §15.6 / §16.4 secrecy). STRICTLY without
 * `correctAnswer` — this DTO is the one returned to players and is the only
 * shape the room ever receives. The answer lives solely on
 * {@link HostQuestionResponseDto} behind the host guard.
 */
export class RoomQuestionResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  categoryId!: string;

  @ApiProperty()
  points!: number;

  @ApiProperty()
  position!: number;

  @ApiProperty()
  text!: string;
}

/**
 * Host-facing view of a question. The ONLY question DTO that carries
 * `correctAnswer`; served only behind the host guard.
 */
export class HostQuestionResponseDto extends RoomQuestionResponseDto {
  @ApiProperty({ description: 'Host-only — never exposed to players.' })
  correctAnswer!: string;
}

/** The bare correct answer, for the host-only answer endpoint. */
export class CurrentAnswerResponseDto {
  @ApiProperty({ nullable: true, description: 'Host-only correct answer.' })
  correctAnswer!: string | null;
}

/** Host response to opening a question: the host view plus the started timer. */
export class OpenQuestionResponseDto {
  @ApiProperty({ type: HostQuestionResponseDto })
  question!: HostQuestionResponseDto;

  @ApiProperty({ type: TimerResponseDto })
  timer!: TimerResponseDto;
}

/** Response to submitting an answer: the room question view plus the new stage. */
export class SubmitAnswerResponseDto {
  @ApiProperty({ example: 'ANSWER_REVIEW' })
  stage!: string;

  @ApiProperty({ type: RoomQuestionResponseDto })
  question!: RoomQuestionResponseDto;
}

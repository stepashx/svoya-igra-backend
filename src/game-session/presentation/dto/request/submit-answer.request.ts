import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Maximum accepted answer length (the text is echoed only, never persisted). */
const MAX_ANSWER_LENGTH = 2000;

/** Body for POST /rooms/:code/questions/answer (active team captain submits). */
export class SubmitAnswerRequestDto {
  @ApiPropertyOptional({
    description:
      'Optional answer text. Not persisted (no column) — only echoed in the ' +
      'answer-submitted event payload.',
    maxLength: MAX_ANSWER_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_ANSWER_LENGTH)
  answer?: string;
}

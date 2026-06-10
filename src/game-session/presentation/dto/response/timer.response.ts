import { ApiProperty } from '@nestjs/swagger';

/**
 * The answer timer state for the GET-timer endpoint and the open-question
 * response. `startedAt`/`endsAt` are ISO strings while RUNNING/EXPIRED and null
 * while IDLE; the client counts down locally to `endsAt`.
 */
export class TimerResponseDto {
  @ApiProperty({ enum: ['RUNNING', 'EXPIRED', 'IDLE'] })
  status!: string;

  @ApiProperty({ format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ format: 'date-time', nullable: true })
  endsAt!: string | null;

  @ApiProperty()
  remainingMs!: number;
}

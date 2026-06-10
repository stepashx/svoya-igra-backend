import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import { RoomNotFoundError } from '../../domain/errors';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { RoomCode } from '../../domain/value-objects';
import { AnswerTimerRegistry, AnswerTimerState } from '../timers';

/**
 * Read model for the GET-timer endpoint (plan §15.7). Resolves the room from its
 * code (invalid → InvalidRoomCodeError, missing → RoomNotFoundError) and returns
 * the lazy {@link AnswerTimerRegistry} read against the current clock. Pure
 * query — no mutation, no events.
 */
@Injectable()
export class TimerQueryService {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly timer: AnswerTimerRegistry,
  ) {}

  async read(code: string): Promise<AnswerTimerState> {
    const room = await this.rooms.findByCode(RoomCode.create(code));
    if (!room) {
      throw new RoomNotFoundError();
    }
    return this.timer.read(room.id, this.clock.now());
  }
}

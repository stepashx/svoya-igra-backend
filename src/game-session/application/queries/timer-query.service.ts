import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import { Room } from '../../domain/entities';
import { RoomNotFoundError } from '../../domain/errors';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { RoomCode } from '../../domain/value-objects';
import {
  AnswerTimerRegistry,
  AnswerTimerState,
  ShopTimerRegistry,
  ShopTimerState,
} from '../timers';

/**
 * Read model for the GET-timer endpoints (plan §15.7 answer, §15.8 shop).
 * Resolves the room from its code (invalid → InvalidRoomCodeError, missing →
 * RoomNotFoundError) and returns the lazy registry read — answer
 * ({@link AnswerTimerRegistry}) or shop ({@link ShopTimerRegistry}, 8.2) —
 * against the current clock. Pure query — no mutation, no events.
 */
@Injectable()
export class TimerQueryService {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    private readonly timer: AnswerTimerRegistry,
    private readonly shopTimer: ShopTimerRegistry,
  ) {}

  async read(code: string): Promise<AnswerTimerState> {
    const room = await this.resolveRoom(code);
    return this.timer.read(room.id, this.clock.now());
  }

  /** The room's shop timer (8.2), minClosableAt/closable included. */
  async readShop(code: string): Promise<ShopTimerState> {
    const room = await this.resolveRoom(code);
    return this.shopTimer.read(room.id, this.clock.now());
  }

  private async resolveRoom(code: string): Promise<Room> {
    const room = await this.rooms.findByCode(RoomCode.create(code));
    if (!room) {
      throw new RoomNotFoundError();
    }
    return room;
  }
}

import { Injectable } from '@nestjs/common';
import { ClockPort } from '../../core/ports/clock.port';

/** System-clock implementation of ClockPort. */
@Injectable()
export class SystemClockAdapter implements ClockPort {
  now(): Date {
    return new Date();
  }

  nowMs(): number {
    return Date.now();
  }
}

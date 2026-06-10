import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

/** Lifecycle of a room's answer timer at the moment it is read. */
export type AnswerTimerStatus = 'RUNNING' | 'EXPIRED' | 'IDLE';

/** The single active answer timer stored for one room. */
interface AnswerTimerEntry {
  cellId: string;
  questionId: string;
  startedAt: Date;
  endsAt: Date;
}

/**
 * Read/return projection of the answer timer. Carries `endsAt` so the client
 * counts down locally; `remainingMs` is a convenience derived against the read
 * clock. `startedAt`/`endsAt` are null only when IDLE.
 */
export interface AnswerTimerState {
  status: AnswerTimerStatus;
  startedAt: Date | null;
  endsAt: Date | null;
  remainingMs: number;
}

/**
 * In-memory, per-process registry of the one active answer timer per room
 * (timer variant (a), plan §14.6 / §16.4). There is no DB column and no server
 * scheduler: {@link OpenQuestionUseCase} `start`s the timer, the GET-timer read,
 * {@link SubmitAnswerUseCase} and the advance bridge `read` it against a
 * {@link ClockPort} `now`, and {@link ReviewAnswerUseCase} `clear`s it. Expiry
 * is therefore a lazy clock comparison — never a background timeout.
 *
 * State does not survive a process restart; persisting it across restarts is
 * explicitly out of scope for the single-node MVP.
 */
@Injectable()
export class AnswerTimerRegistry {
  private readonly timers = new Map<string, AnswerTimerEntry>();

  constructor(private readonly config: AppConfigService) {}

  /**
   * Start (replacing any prior) the room's answer timer:
   * `endsAt = now + ANSWER_TIMER_SECONDS`. Returns the RUNNING projection so the
   * caller can both emit `question-timer-started` and answer the REST call
   * without an extra read.
   */
  start(
    roomId: string,
    cellId: string,
    questionId: string,
    now: Date,
  ): AnswerTimerState {
    const startedAt = now;
    const endsAt = new Date(
      now.getTime() + this.config.timers.answerSeconds * 1000,
    );
    this.timers.set(roomId, { cellId, questionId, startedAt, endsAt });
    return {
      status: 'RUNNING',
      startedAt,
      endsAt,
      remainingMs: endsAt.getTime() - now.getTime(),
    };
  }

  /**
   * Lazy read against `now`: IDLE when no timer is set, EXPIRED once `now` has
   * reached `endsAt` (remaining clamped to 0), otherwise RUNNING.
   */
  read(roomId: string, now: Date): AnswerTimerState {
    const entry = this.timers.get(roomId);
    if (!entry) {
      return { status: 'IDLE', startedAt: null, endsAt: null, remainingMs: 0 };
    }
    const remainingMs = entry.endsAt.getTime() - now.getTime();
    if (remainingMs <= 0) {
      return {
        status: 'EXPIRED',
        startedAt: entry.startedAt,
        endsAt: entry.endsAt,
        remainingMs: 0,
      };
    }
    return {
      status: 'RUNNING',
      startedAt: entry.startedAt,
      endsAt: entry.endsAt,
      remainingMs,
    };
  }

  /** Drop the room's timer (on answer review). Idempotent. */
  clear(roomId: string): void {
    this.timers.delete(roomId);
  }
}

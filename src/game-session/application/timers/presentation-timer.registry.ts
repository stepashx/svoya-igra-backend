import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

/** Lifecycle of a room's presentation-preparation timer at the moment it is read. */
export type PresentationTimerStatus = 'RUNNING' | 'EXPIRED' | 'IDLE';

/** The single active preparation timer stored for one room. */
interface PresentationTimerEntry {
  startedAt: Date;
  endsAt: Date;
}

/**
 * Read/return projection of the preparation timer. Carries `endsAt` so the
 * client counts down locally to the deadline; `remainingMs` is a convenience
 * derived against the read clock. `startedAt`/`endsAt` are null only when IDLE.
 * Its OWN type (the one-type-per-timer convention) — structurally like
 * {@link AnswerTimerState}, but kept distinct so the two never couple.
 */
export interface PresentationTimerState {
  status: PresentationTimerStatus;
  startedAt: Date | null;
  endsAt: Date | null;
  remainingMs: number;
}

/**
 * In-memory, per-process registry of the one active preparation timer per room
 * (§14.9 / §16.6, the {@link AnswerTimerRegistry} pattern). There is no DB
 * column and no server scheduler: {@link StartPresentationPreparationUseCase}
 * `start`s the timer when the host opens preparation, the GET-deadline read
 * `read`s it against a {@link ClockPort} `now`, and a later stage `clear`s it.
 * Expiry is a lazy clock comparison — never a background timeout; the EXPIRED
 * state surfaces only when the deadline is read.
 *
 * The host may (re)start preparation at any time: a second `start` REPLACES the
 * prior entry with fresh stamps (no "already started" error), so clients resync
 * to the new deadline. `clear` is provided for symmetry but is NOT called in
 * 9.2 — exiting PRESENTATION_PREPARATION lands in Stage 10.
 *
 * State does not survive a process restart; persisting it across restarts is
 * explicitly out of scope for the single-node MVP.
 */
@Injectable()
export class PresentationTimerRegistry {
  private readonly timers = new Map<string, PresentationTimerEntry>();

  constructor(private readonly config: AppConfigService) {}

  /**
   * Start (replacing any prior) the room's preparation timer:
   * `endsAt = now + PRESENTATION_PREP_SECONDS`. Returns the RUNNING projection
   * so the caller can both emit `timer-started` and answer the REST call
   * without an extra read.
   */
  start(roomId: string, now: Date): PresentationTimerState {
    const startedAt = now;
    const endsAt = new Date(
      now.getTime() + this.config.timers.presentationPrepSeconds * 1000,
    );
    this.timers.set(roomId, { startedAt, endsAt });
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
  read(roomId: string, now: Date): PresentationTimerState {
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

  /** Drop the room's timer (on leaving preparation, Stage 10). Idempotent. */
  clear(roomId: string): void {
    this.timers.delete(roomId);
  }
}

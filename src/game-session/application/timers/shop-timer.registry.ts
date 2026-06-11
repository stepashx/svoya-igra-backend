import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';

/** Lifecycle of a room's shop timer at the moment it is read. */
export type ShopTimerStatus = 'RUNNING' | 'EXPIRED' | 'IDLE';

/** The single active shop timer stored for one room. */
interface ShopTimerEntry {
  startedAt: Date;
  endsAt: Date;
  minClosableAt: Date;
}

/**
 * Read/return projection of the shop timer. Carries `endsAt` so the client
 * counts down locally and `minClosableAt` so it can disable the close button;
 * `remainingMs` is a convenience derived against the read clock and `closable`
 * applies the §14.8 minimum-open rule (see {@link ShopTimerRegistry}). The
 * Date stamps are null only when IDLE. Distinct from `AnswerTimerState`, which
 * has no minimum-open window.
 */
export interface ShopTimerState {
  status: ShopTimerStatus;
  startedAt: Date | null;
  endsAt: Date | null;
  minClosableAt: Date | null;
  remainingMs: number;
  closable: boolean;
}

/**
 * In-memory, per-process registry of the one active shop timer per room
 * (§14.8, the {@link AnswerTimerRegistry} pattern). There is no DB column and
 * no server scheduler: {@link ReviewAnswerUseCase} `start`s the timer on every
 * shop entry (round 2+ replaces the prior entry with fresh stamps), the
 * GET-round read and {@link CloseShopUseCase} `read` it against a `ClockPort`
 * `now`, and CloseShop `clear`s it. Expiry is a lazy clock comparison; the
 * host bridges it by calling the same close endpoint the button uses.
 *
 * `closable = status !== 'RUNNING' || now >= minClosableAt` — closure is
 * blocked ONLY while RUNNING before the minimum. The permissive arms are
 * deliberate soft-lock protection: IDLE (a process restart dropped the entry —
 * the minimum is knowingly lost) and EXPIRED (also reached when
 * SHOP_MIN_SECONDS is misconfigured beyond SHOP_TIMER_SECONDS, which is why
 * the env schema needs no cross-field min<=shop check) always allow closing.
 *
 * State does not survive a process restart; persisting it across restarts is
 * explicitly out of scope for the single-node MVP.
 */
@Injectable()
export class ShopTimerRegistry {
  private readonly timers = new Map<string, ShopTimerEntry>();

  constructor(private readonly config: AppConfigService) {}

  /**
   * Start (replacing any prior) the room's shop timer:
   * `endsAt = now + SHOP_TIMER_SECONDS`, `minClosableAt = now +
   * SHOP_MIN_SECONDS`. Returns the RUNNING projection so the caller can both
   * emit `shop-opened`/`shop-final-opened` and answer the REST call without an
   * extra read.
   */
  start(roomId: string, now: Date): ShopTimerState {
    const startedAt = now;
    const endsAt = new Date(
      now.getTime() + this.config.timers.shopSeconds * 1000,
    );
    const minClosableAt = new Date(
      now.getTime() + this.config.timers.shopMinSeconds * 1000,
    );
    this.timers.set(roomId, { startedAt, endsAt, minClosableAt });
    return {
      status: 'RUNNING',
      startedAt,
      endsAt,
      minClosableAt,
      remainingMs: endsAt.getTime() - now.getTime(),
      closable: now.getTime() >= minClosableAt.getTime(),
    };
  }

  /**
   * Lazy read against `now`: IDLE when no timer is set, EXPIRED once `now` has
   * reached `endsAt` (remaining clamped to 0), otherwise RUNNING. IDLE and
   * EXPIRED are always closable; RUNNING only from `minClosableAt` on.
   */
  read(roomId: string, now: Date): ShopTimerState {
    const entry = this.timers.get(roomId);
    if (!entry) {
      return {
        status: 'IDLE',
        startedAt: null,
        endsAt: null,
        minClosableAt: null,
        remainingMs: 0,
        closable: true,
      };
    }
    const remainingMs = entry.endsAt.getTime() - now.getTime();
    if (remainingMs <= 0) {
      return {
        status: 'EXPIRED',
        startedAt: entry.startedAt,
        endsAt: entry.endsAt,
        minClosableAt: entry.minClosableAt,
        remainingMs: 0,
        closable: true,
      };
    }
    return {
      status: 'RUNNING',
      startedAt: entry.startedAt,
      endsAt: entry.endsAt,
      minClosableAt: entry.minClosableAt,
      remainingMs,
      closable: now.getTime() >= entry.minClosableAt.getTime(),
    };
  }

  /** Drop the room's timer (on shop close). Idempotent. */
  clear(roomId: string): void {
    this.timers.delete(roomId);
  }
}

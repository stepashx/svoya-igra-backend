/**
 * Abstraction over the system clock so timer/expiry logic stays testable
 * without `Date.now()` scattered through the codebase. Implemented by an
 * infrastructure adapter.
 */
export interface ClockPort {
  /** Current wall-clock time. */
  now(): Date;

  /** Current time as epoch milliseconds. */
  nowMs(): number;
}

export const CLOCK_PORT = Symbol('ClockPort');

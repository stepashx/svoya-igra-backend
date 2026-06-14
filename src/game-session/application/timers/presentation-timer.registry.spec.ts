import { AppConfigService } from '../../../config/app-config.service';
import { PresentationTimerRegistry } from './presentation-timer.registry';

describe('PresentationTimerRegistry', () => {
  const PREP_SECONDS = 600;
  const start = new Date('2026-06-14T12:00:00.000Z');
  const at = (offsetMs: number): Date => new Date(start.getTime() + offsetMs);

  const config = {
    timers: { presentationPrepSeconds: PREP_SECONDS },
  } as unknown as AppConfigService;

  const build = (): PresentationTimerRegistry =>
    new PresentationTimerRegistry(config);

  it('start returns a RUNNING state with the endsAt offset', () => {
    const registry = build();
    const state = registry.start('room-1', start);
    expect(state.status).toBe('RUNNING');
    expect(state.startedAt).toEqual(start);
    expect(state.endsAt).toEqual(at(PREP_SECONDS * 1000));
    expect(state.remainingMs).toBe(PREP_SECONDS * 1000);
  });

  it('start replaces a prior timer: a second start wins (re-open resync)', () => {
    const registry = build();
    registry.start('room-1', start);
    registry.start('room-1', at(10_000));

    const state = registry.read('room-1', at(10_000));
    expect(state.startedAt).toEqual(at(10_000));
    expect(state.endsAt).toEqual(at(10_000 + PREP_SECONDS * 1000));
    expect(state.remainingMs).toBe(PREP_SECONDS * 1000);
  });

  it('reads RUNNING with the remaining window while now is before endsAt', () => {
    const registry = build();
    registry.start('room-1', start);
    const state = registry.read('room-1', at(45_000));
    expect(state.status).toBe('RUNNING');
    expect(state.remainingMs).toBe(PREP_SECONDS * 1000 - 45_000);
    expect(state.endsAt).toEqual(at(PREP_SECONDS * 1000));
  });

  it('reads EXPIRED with remaining clamped to 0 once now reaches endsAt', () => {
    const registry = build();
    registry.start('room-1', start);
    const state = registry.read('room-1', at(PREP_SECONDS * 1000));
    expect(state.status).toBe('EXPIRED');
    expect(state.remainingMs).toBe(0);
    expect(state.startedAt).toEqual(start);
    expect(state.endsAt).toEqual(at(PREP_SECONDS * 1000));
  });

  it('reads IDLE (null stamps) for a room with no timer', () => {
    const registry = build();
    const state = registry.read('room-unknown', start);
    expect(state.status).toBe('IDLE');
    expect(state.startedAt).toBeNull();
    expect(state.endsAt).toBeNull();
    expect(state.remainingMs).toBe(0);
  });

  it('clear removes the timer so a later read is IDLE again (idempotent)', () => {
    const registry = build();
    registry.start('room-1', start);
    expect(registry.read('room-1', at(1_000)).status).toBe('RUNNING');

    registry.clear('room-1');
    expect(registry.read('room-1', at(1_000)).status).toBe('IDLE');

    expect(() => registry.clear('room-1')).not.toThrow();
  });

  it('keeps timers isolated per room', () => {
    const registry = build();
    registry.start('room-1', start);
    registry.start('room-2', at(30_000));

    expect(registry.read('room-1', at(30_000)).remainingMs).toBe(
      PREP_SECONDS * 1000 - 30_000,
    );
    expect(registry.read('room-2', at(30_000)).remainingMs).toBe(
      PREP_SECONDS * 1000,
    );

    registry.clear('room-1');
    expect(registry.read('room-1', at(30_000)).status).toBe('IDLE');
    expect(registry.read('room-2', at(30_000)).status).toBe('RUNNING');
  });
});

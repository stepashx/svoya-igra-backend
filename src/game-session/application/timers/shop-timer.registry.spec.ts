import { AppConfigService } from '../../../config/app-config.service';
import { ShopTimerRegistry } from './shop-timer.registry';

describe('ShopTimerRegistry', () => {
  const SHOP_SECONDS = 120;
  const MIN_SECONDS = 30;
  const start = new Date('2026-06-10T12:00:00.000Z');
  const at = (offsetMs: number): Date => new Date(start.getTime() + offsetMs);

  const config = {
    timers: { shopSeconds: SHOP_SECONDS, shopMinSeconds: MIN_SECONDS },
  } as unknown as AppConfigService;

  const build = (): ShopTimerRegistry => new ShopTimerRegistry(config);

  it('start returns a RUNNING state with endsAt/minClosableAt offsets', () => {
    const registry = build();
    const state = registry.start('room-1', start);
    expect(state.status).toBe('RUNNING');
    expect(state.startedAt).toEqual(start);
    expect(state.endsAt).toEqual(at(SHOP_SECONDS * 1000));
    expect(state.minClosableAt).toEqual(at(MIN_SECONDS * 1000));
    expect(state.remainingMs).toBe(SHOP_SECONDS * 1000);
    expect(state.closable).toBe(false);
  });

  it('start replaces a prior timer: a second start wins (round 2 entry)', () => {
    const registry = build();
    registry.start('room-1', start);
    registry.start('room-1', at(10_000));

    const state = registry.read('room-1', at(10_000));
    expect(state.startedAt).toEqual(at(10_000));
    expect(state.endsAt).toEqual(at(10_000 + SHOP_SECONDS * 1000));
    expect(state.minClosableAt).toEqual(at(10_000 + MIN_SECONDS * 1000));
    expect(state.remainingMs).toBe(SHOP_SECONDS * 1000);
  });

  describe('closable rule: blocked ONLY while RUNNING before the minimum', () => {
    it('RUNNING before minClosableAt is NOT closable', () => {
      const registry = build();
      registry.start('room-1', start);
      const state = registry.read('room-1', at(MIN_SECONDS * 1000 - 1));
      expect(state.status).toBe('RUNNING');
      expect(state.closable).toBe(false);
    });

    it('RUNNING from minClosableAt on IS closable', () => {
      const registry = build();
      registry.start('room-1', start);
      const state = registry.read('room-1', at(MIN_SECONDS * 1000));
      expect(state.status).toBe('RUNNING');
      expect(state.closable).toBe(true);
    });

    it('EXPIRED is always closable (covers a min>shop misconfig)', () => {
      const registry = build();
      registry.start('room-1', start);
      const state = registry.read('room-1', at(SHOP_SECONDS * 1000));
      expect(state.status).toBe('EXPIRED');
      expect(state.remainingMs).toBe(0);
      expect(state.closable).toBe(true);
    });

    it('IDLE is always closable (post-restart soft-lock protection)', () => {
      const registry = build();
      const state = registry.read('room-unknown', start);
      expect(state.status).toBe('IDLE');
      expect(state.startedAt).toBeNull();
      expect(state.endsAt).toBeNull();
      expect(state.minClosableAt).toBeNull();
      expect(state.remainingMs).toBe(0);
      expect(state.closable).toBe(true);
    });
  });

  it('reads RUNNING with the remaining window while now is before endsAt', () => {
    const registry = build();
    registry.start('room-1', start);
    const state = registry.read('room-1', at(45_000));
    expect(state.status).toBe('RUNNING');
    expect(state.remainingMs).toBe(SHOP_SECONDS * 1000 - 45_000);
    expect(state.endsAt).toEqual(at(SHOP_SECONDS * 1000));
  });

  it('clear removes the timer so a later read is IDLE again', () => {
    const registry = build();
    registry.start('room-1', start);
    expect(registry.read('room-1', at(1_000)).status).toBe('RUNNING');

    registry.clear('room-1');
    expect(registry.read('room-1', at(1_000)).status).toBe('IDLE');

    // clear is idempotent.
    expect(() => registry.clear('room-1')).not.toThrow();
  });

  it('keeps timers isolated per room', () => {
    const registry = build();
    registry.start('room-1', start);
    registry.start('room-2', at(30_000));

    expect(registry.read('room-1', at(30_000)).remainingMs).toBe(90_000);
    expect(registry.read('room-2', at(30_000)).remainingMs).toBe(
      SHOP_SECONDS * 1000,
    );

    registry.clear('room-1');
    expect(registry.read('room-1', at(30_000)).status).toBe('IDLE');
    expect(registry.read('room-2', at(30_000)).status).toBe('RUNNING');
  });
});

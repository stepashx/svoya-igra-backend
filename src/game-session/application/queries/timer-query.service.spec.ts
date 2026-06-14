import { RoomNotFoundError } from '../../domain/errors';
import {
  FIXED_NOW,
  makeClock,
  makePresentationTimerRegistry,
  makeRoom,
  makeRoomRepo,
  makeShopTimerRegistry,
  makeTimerRegistry,
} from '../use-cases/lobby-test-doubles';
import { TimerQueryService } from './timer-query.service';

describe('TimerQueryService', () => {
  const PREP_SECONDS = 600;

  const build = (now: Date = FIXED_NOW) => {
    const rooms = makeRoomRepo();
    const timer = makeTimerRegistry(60);
    const shopTimer = makeShopTimerRegistry(120, 30);
    const presentationTimer = makePresentationTimerRegistry(PREP_SECONDS);
    rooms.findByCode.mockResolvedValue(makeRoom({ id: 'room-1' }));
    const service = new TimerQueryService(
      rooms,
      makeClock(now),
      timer,
      shopTimer,
      presentationTimer,
    );
    return { service, rooms, timer, shopTimer, presentationTimer };
  };

  it('projects RUNNING while the timer is active', async () => {
    const { service, timer } = build();
    timer.start('room-1', 'cell-1', 'question-1', FIXED_NOW);
    expect((await service.read('ABCDEF')).status).toBe('RUNNING');
  });

  it('projects EXPIRED once past endsAt', async () => {
    const { service, timer } = build(new Date(FIXED_NOW.getTime() + 61_000));
    timer.start('room-1', 'cell-1', 'question-1', FIXED_NOW);
    expect((await service.read('ABCDEF')).status).toBe('EXPIRED');
  });

  it('projects IDLE when no timer is set for the room', async () => {
    const { service } = build();
    expect((await service.read('ABCDEF')).status).toBe('IDLE');
  });

  it('throws when the room is unknown', async () => {
    const { service, rooms } = build();
    rooms.findByCode.mockResolvedValue(null);
    await expect(service.read('ABCDEF')).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });

  describe('readShop (8.2)', () => {
    it('projects the RUNNING shop timer with minClosableAt/closable', async () => {
      const { service, shopTimer } = build(
        new Date(FIXED_NOW.getTime() + 31_000),
      );
      shopTimer.start('room-1', FIXED_NOW);

      const state = await service.readShop('ABCDEF');
      expect(state.status).toBe('RUNNING');
      expect(state.minClosableAt).toEqual(
        new Date(FIXED_NOW.getTime() + 30_000),
      );
      expect(state.closable).toBe(true);
    });

    it('projects IDLE (closable) when no shop timer is set', async () => {
      const { service } = build();
      const state = await service.readShop('ABCDEF');
      expect(state.status).toBe('IDLE');
      expect(state.closable).toBe(true);
    });

    it('throws when the room is unknown', async () => {
      const { service, rooms } = build();
      rooms.findByCode.mockResolvedValue(null);
      await expect(service.readShop('ABCDEF')).rejects.toBeInstanceOf(
        RoomNotFoundError,
      );
    });
  });

  describe('readPresentation (9.2)', () => {
    it('projects the RUNNING preparation timer with its endsAt', async () => {
      const { service, presentationTimer } = build();
      presentationTimer.start('room-1', FIXED_NOW);

      const state = await service.readPresentation('ABCDEF');
      expect(state.status).toBe('RUNNING');
      expect(state.endsAt).toEqual(
        new Date(FIXED_NOW.getTime() + PREP_SECONDS * 1000),
      );
      expect(state.remainingMs).toBe(PREP_SECONDS * 1000);
    });

    it('projects EXPIRED once past endsAt', async () => {
      const { service, presentationTimer } = build(
        new Date(FIXED_NOW.getTime() + PREP_SECONDS * 1000 + 1_000),
      );
      presentationTimer.start('room-1', FIXED_NOW);
      const state = await service.readPresentation('ABCDEF');
      expect(state.status).toBe('EXPIRED');
      expect(state.remainingMs).toBe(0);
    });

    it('projects IDLE when no preparation timer is set', async () => {
      const { service } = build();
      const state = await service.readPresentation('ABCDEF');
      expect(state.status).toBe('IDLE');
      expect(state.endsAt).toBeNull();
    });

    it('throws when the room is unknown', async () => {
      const { service, rooms } = build();
      rooms.findByCode.mockResolvedValue(null);
      await expect(service.readPresentation('ABCDEF')).rejects.toBeInstanceOf(
        RoomNotFoundError,
      );
    });
  });
});

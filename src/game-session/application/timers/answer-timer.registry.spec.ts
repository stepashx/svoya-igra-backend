import { AppConfigService } from '../../../config/app-config.service';
import { AnswerTimerRegistry } from './answer-timer.registry';

describe('AnswerTimerRegistry', () => {
  const ANSWER_SECONDS = 60;
  const start = new Date('2026-06-10T12:00:00.000Z');
  const at = (offsetMs: number): Date => new Date(start.getTime() + offsetMs);

  const config = {
    timers: { answerSeconds: ANSWER_SECONDS },
  } as unknown as AppConfigService;

  const build = (): AnswerTimerRegistry => new AnswerTimerRegistry(config);

  it('start returns a RUNNING state with endsAt = now + answerSeconds', () => {
    const registry = build();
    const state = registry.start('room-1', 'cell-1', 'question-1', start);
    expect(state.status).toBe('RUNNING');
    expect(state.startedAt).toEqual(start);
    expect(state.endsAt).toEqual(at(ANSWER_SECONDS * 1000));
    expect(state.remainingMs).toBe(ANSWER_SECONDS * 1000);
  });

  it('reads RUNNING while now is before endsAt', () => {
    const registry = build();
    registry.start('room-1', 'cell-1', 'question-1', start);
    const state = registry.read('room-1', at(10_000));
    expect(state.status).toBe('RUNNING');
    expect(state.remainingMs).toBe(ANSWER_SECONDS * 1000 - 10_000);
    expect(state.endsAt).toEqual(at(ANSWER_SECONDS * 1000));
  });

  it('reads EXPIRED once now reaches endsAt, clamping remaining to 0', () => {
    const registry = build();
    registry.start('room-1', 'cell-1', 'question-1', start);

    const exactlyAtEnd = registry.read('room-1', at(ANSWER_SECONDS * 1000));
    expect(exactlyAtEnd.status).toBe('EXPIRED');
    expect(exactlyAtEnd.remainingMs).toBe(0);

    const wellPast = registry.read('room-1', at(ANSWER_SECONDS * 1000 + 5_000));
    expect(wellPast.status).toBe('EXPIRED');
    expect(wellPast.remainingMs).toBe(0);
    expect(wellPast.endsAt).toEqual(at(ANSWER_SECONDS * 1000));
  });

  it('reads IDLE when no timer is set for the room', () => {
    const registry = build();
    const state = registry.read('room-unknown', start);
    expect(state.status).toBe('IDLE');
    expect(state.startedAt).toBeNull();
    expect(state.endsAt).toBeNull();
    expect(state.remainingMs).toBe(0);
  });

  it('clear removes the timer so a later read is IDLE again', () => {
    const registry = build();
    registry.start('room-1', 'cell-1', 'question-1', start);
    expect(registry.read('room-1', at(1_000)).status).toBe('RUNNING');

    registry.clear('room-1');
    expect(registry.read('room-1', at(1_000)).status).toBe('IDLE');

    // clear is idempotent.
    expect(() => registry.clear('room-1')).not.toThrow();
  });

  it('keeps timers isolated per room', () => {
    const registry = build();
    registry.start('room-1', 'cell-1', 'question-1', start);
    registry.start('room-2', 'cell-2', 'question-2', at(30_000));

    expect(registry.read('room-1', at(30_000)).remainingMs).toBe(30_000);
    expect(registry.read('room-2', at(30_000)).remainingMs).toBe(
      ANSWER_SECONDS * 1000,
    );

    registry.clear('room-1');
    expect(registry.read('room-1', at(30_000)).status).toBe('IDLE');
    expect(registry.read('room-2', at(30_000)).status).toBe('RUNNING');
  });
});

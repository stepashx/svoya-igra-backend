import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { PresentationEvent } from '../events';
import { StartPresentationPreparationUseCase } from './start-presentation-preparation.use-case';
import {
  FIXED_NOW,
  makeClock,
  makePresentationTimerRegistry,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('StartPresentationPreparationUseCase', () => {
  const PREP_SECONDS = 600;
  const at = (offsetMs: number): Date =>
    new Date(FIXED_NOW.getTime() + offsetMs);

  /**
   * A room parked in PRESENTATION_PREPARATION (the 8.2 final-shop close lands it
   * here) and a use case whose clock reads `now`. The preparation timer starts
   * IDLE — the use case starts it.
   */
  const build = (now: Date = FIXED_NOW) => {
    const rooms = makeRoomRepo();
    const realtime = makeRealtime();
    const presentationTimer = makePresentationTimerRegistry(PREP_SECONDS);
    rooms.findById.mockResolvedValue(
      makeRoom({
        currentStage: 'PRESENTATION_PREPARATION',
        currentTeamId: 'team-2',
      }),
    );
    const uc = new StartPresentationPreparationUseCase(
      rooms,
      realtime,
      makeClock(now),
      makeTransactionPort(),
      presentationTimer,
    );
    return { uc, rooms, realtime, presentationTimer };
  };

  it('starts the prep timer (RUNNING, endsAt = now + PREP) and reads back RUNNING', async () => {
    const { uc, presentationTimer } = build();

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result.timer.status).toBe('RUNNING');
    expect(result.timer.startedAt).toEqual(FIXED_NOW);
    expect(result.timer.endsAt).toEqual(at(PREP_SECONDS * 1000));
    expect(result.timer.remainingMs).toBe(PREP_SECONDS * 1000);
    expect(presentationTimer.read('room-1', FIXED_NOW).status).toBe('RUNNING');
  });

  it('emits preparation-started THEN timer-started (room-wide), and does NOT touch the room', async () => {
    const { uc, rooms, realtime } = build();

    const result = await uc.execute({ roomId: 'room-1' });

    // The stage is NOT changed and the room is never persisted (unlike CloseShop).
    expect(rooms.update).not.toHaveBeenCalled();

    // Ordered, public payloads.
    expect(realtime.emitToRoom).toHaveBeenCalledTimes(2);
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      1,
      'room-1',
      PresentationEvent.PreparationStarted,
      { roomId: 'room-1', stage: 'PRESENTATION_PREPARATION' },
    );
    expect(realtime.emitToRoom).toHaveBeenNthCalledWith(
      2,
      'room-1',
      PresentationEvent.TimerStarted,
      {
        roomId: 'room-1',
        startedAt: result.timer.startedAt,
        endsAt: result.timer.endsAt,
      },
    );
  });

  it('a repeat call REPLACES the timer with fresh stamps and re-emits both (no error)', async () => {
    const rooms = makeRoomRepo();
    const realtime = makeRealtime();
    const presentationTimer = makePresentationTimerRegistry(PREP_SECONDS);
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'PRESENTATION_PREPARATION' }),
    );
    const makeUc = (now: Date) =>
      new StartPresentationPreparationUseCase(
        rooms,
        realtime,
        makeClock(now),
        makeTransactionPort(),
        presentationTimer,
      );

    const first = await makeUc(FIXED_NOW).execute({ roomId: 'room-1' });
    const second = await makeUc(at(10_000)).execute({ roomId: 'room-1' });

    expect(second.timer.startedAt).toEqual(at(10_000));
    expect(second.timer.endsAt).toEqual(at(10_000 + PREP_SECONDS * 1000));
    expect(second.timer.startedAt).not.toEqual(first.timer.startedAt);
    // The registry reflects the latest start.
    expect(presentationTimer.read('room-1', at(10_000)).endsAt).toEqual(
      at(10_000 + PREP_SECONDS * 1000),
    );

    // Both events fired on each call; no room mutation ever.
    const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
    expect(emitted).toEqual([
      PresentationEvent.PreparationStarted,
      PresentationEvent.TimerStarted,
      PresentationEvent.PreparationStarted,
      PresentationEvent.TimerStarted,
    ]);
    expect(rooms.update).not.toHaveBeenCalled();
  });

  it('rejects outside PRESENTATION_PREPARATION — no timer start, no emission', async () => {
    const { uc, rooms, realtime, presentationTimer } = build();
    rooms.findById.mockResolvedValue(makeRoom({ currentStage: 'SHOP' }));

    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
    expect(presentationTimer.read('room-1', FIXED_NOW).status).toBe('IDLE');
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
    expect(rooms.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown room', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(null);
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });

  it('rejects a room that is not ACTIVE', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(
      makeRoom({
        currentStage: 'PRESENTATION_PREPARATION',
        status: 'CLOSED',
        finishedAt: FIXED_NOW,
      }),
    );
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
  });
});

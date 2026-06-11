import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import {
  RoomNotActiveError,
  RoomNotFoundError,
  ShopMinimumTimeNotElapsedError,
} from '../../domain/errors';
import { CommerceEvent } from '../events';
import { CloseShopUseCase } from './close-shop.use-case';
import {
  FIXED_NOW,
  makeClock,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeShopTimerRegistry,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('CloseShopUseCase', () => {
  const SHOP_SECONDS = 120;
  const MIN_SECONDS = 30;
  const at = (offsetMs: number): Date =>
    new Date(FIXED_NOW.getTime() + offsetMs);

  /**
   * A room parked in SHOP with the given blocked count and a use case whose
   * clock reads `now`. The shop timer is NOT started here — tests start it
   * explicitly to model RUNNING/EXPIRED/IDLE.
   */
  const build = (now: Date = FIXED_NOW, blockedQuestionsCount = 6) => {
    const rooms = makeRoomRepo();
    const realtime = makeRealtime();
    const shopTimer = makeShopTimerRegistry(SHOP_SECONDS, MIN_SECONDS);
    rooms.findById.mockResolvedValue(
      makeRoom({
        currentStage: 'SHOP',
        currentTeamId: 'team-2',
        blockedQuestionsCount,
        currentShopRound: 1,
      }),
    );
    const uc = new CloseShopUseCase(
      rooms,
      realtime,
      makeClock(now),
      makeTransactionPort(),
      shopTimer,
    );
    return { uc, rooms, realtime, shopTimer };
  };

  it('closes a regular shop back to GAME_BOARD and emits shop-closed', async () => {
    const { uc, rooms, realtime, shopTimer } = build(at(MIN_SECONDS * 1000));
    shopTimer.start('room-1', FIXED_NOW);

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result.stage).toBe('GAME_BOARD');
    const updatedRoom = rooms.update.mock.calls[0][0];
    expect(updatedRoom.currentStage).toBe('GAME_BOARD');
    expect(realtime.emitToRoom).toHaveBeenCalledTimes(1);
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      CommerceEvent.ShopClosed,
      { roomId: 'room-1', currentShopRound: 1, nextStage: 'GAME_BOARD' },
    );
  });

  it('closes the FINAL shop (board exhausted) on to PRESENTATION_PREPARATION', async () => {
    const { uc, realtime, shopTimer } = build(at(MIN_SECONDS * 1000), 30);
    shopTimer.start('room-1', FIXED_NOW);

    const result = await uc.execute({ roomId: 'room-1' });

    expect(result.stage).toBe('PRESENTATION_PREPARATION');
    expect(realtime.emitToRoom).toHaveBeenCalledWith(
      'room-1',
      CommerceEvent.ShopClosed,
      {
        roomId: 'room-1',
        currentShopRound: 1,
        nextStage: 'PRESENTATION_PREPARATION',
      },
    );
  });

  it('rejects closing before the minimum open time (RUNNING, 409)', async () => {
    const { uc, rooms, realtime, shopTimer } = build(
      at(MIN_SECONDS * 1000 - 1),
    );
    shopTimer.start('room-1', FIXED_NOW);

    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      ShopMinimumTimeNotElapsedError,
    );
    expect(rooms.update).not.toHaveBeenCalled();
    expect(realtime.emitToRoom).not.toHaveBeenCalled();
    // The rejected attempt leaves the timer in place.
    expect(shopTimer.read('room-1', FIXED_NOW).status).toBe('RUNNING');
  });

  it('closes from the minimum boundary on (RUNNING past minClosableAt)', async () => {
    const { uc, shopTimer } = build(at(MIN_SECONDS * 1000));
    shopTimer.start('room-1', FIXED_NOW);

    await expect(uc.execute({ roomId: 'room-1' })).resolves.toEqual({
      stage: 'GAME_BOARD',
    });
  });

  it('an EXPIRED timer is closable (the timeout bridge path)', async () => {
    const { uc, shopTimer } = build(at(SHOP_SECONDS * 1000 + 1));
    shopTimer.start('room-1', FIXED_NOW);

    await expect(uc.execute({ roomId: 'room-1' })).resolves.toEqual({
      stage: 'GAME_BOARD',
    });
  });

  it('an IDLE timer is closable (post-restart soft-lock protection)', async () => {
    const { uc } = build(); // no start: the registry knows nothing of room-1

    await expect(uc.execute({ roomId: 'room-1' })).resolves.toEqual({
      stage: 'GAME_BOARD',
    });
  });

  it('clears the timer on close so a later read is IDLE', async () => {
    const { uc, shopTimer } = build(at(MIN_SECONDS * 1000));
    shopTimer.start('room-1', FIXED_NOW);

    await uc.execute({ roomId: 'room-1' });

    expect(shopTimer.read('room-1', at(MIN_SECONDS * 1000)).status).toBe(
      'IDLE',
    );
  });

  it('does NOT move the turn: no game-turn-changed, currentTeamId intact', async () => {
    const { uc, rooms, realtime, shopTimer } = build(at(MIN_SECONDS * 1000));
    shopTimer.start('room-1', FIXED_NOW);

    await uc.execute({ roomId: 'room-1' });

    const updatedRoom = rooms.update.mock.calls[0][0];
    expect(updatedRoom.currentTeamId).toBe('team-2');
    const emitted = realtime.emitToRoom.mock.calls.map(([, event]) => event);
    expect(emitted).toEqual([CommerceEvent.ShopClosed]);
  });

  it('rejects closing outside SHOP', async () => {
    const { uc, rooms } = build();
    rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'GAME_BOARD', blockedQuestionsCount: 6 }),
    );
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
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
        currentStage: 'SHOP',
        status: 'CLOSED',
        blockedQuestionsCount: 6,
        finishedAt: FIXED_NOW,
      }),
    );
    await expect(uc.execute({ roomId: 'room-1' })).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
  });
});

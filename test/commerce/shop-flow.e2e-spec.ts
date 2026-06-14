import { INestApplication } from '@nestjs/common';
import { ShopTimerRegistry } from '../../src/game-session/application/timers';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import { closeDbWritePool, presetRoomCounters } from '../utils/db-write';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import { CreatedRoom } from '../utils/lobby-client';
import { getBoard, getGameState, selectCell } from '../utils/gameplay-client';
import { closeShop, getShopItems, getShopRound } from '../utils/shop-client';
import {
  FAST_SHOP_TIMER,
  playCycle as driverPlayCycle,
  sleep,
  startBattle as driverStartBattle,
} from '../utils/battle-driver';

/**
 * Shop entry/exit flow over real Postgres (sub-stage 8.2). The thresholds far
 * from the start are reached by PRESETTING the room counters with a raw UPDATE
 * (db-write) instead of grinding 12/30 live cycles; the threshold cycle itself
 * is always played live. battle-cycle.e2e stays the untouched regression guard
 * for the non-threshold path (it never reviews more than once per test).
 */
describe('Shop flow (e2e)', () => {
  let app: INestApplication;
  let events: CapturedEvent[];

  beforeAll(async () => {
    const e2e = await createE2EApp((builder) =>
      builder.overrideProvider(ShopTimerRegistry).useValue(FAST_SHOP_TIMER),
    );
    app = e2e.app;
    events = e2e.events;
  });

  afterAll(async () => {
    await app.close();
    await closeTruncatePool();
    await closeDbWritePool();
  });

  beforeEach(async () => {
    await truncateLobby();
    events.length = 0;
  });

  // Battle helpers extracted to test/utils/battle-driver.ts (shared with the
  // 8.3 shop-purchase suite); these thin wrappers bind the suite `app` so the
  // scenarios below stay byte-identical to the 8.2 originals.
  const startBattle = () => driverStartBattle(app);
  const playCycle = (room: CreatedRoom, tokenByTeam: Record<string, string>) =>
    driverPlayCycle(app, room, tokenByTeam);

  it('opens the shop on the 6th blocked question and closes back to the board', async () => {
    const { room, tokenByTeam } = await startBattle();
    events.length = 0;

    // Five cycles: no commerce event fires before the threshold.
    for (let cycle = 1; cycle <= 5; cycle += 1) {
      await playCycle(room, tokenByTeam);
    }
    expect(
      events.filter((event) => event.event.startsWith('server:commerce:')),
    ).toEqual([]);

    // The 6th review enters SHOP.
    await playCycle(room, tokenByTeam);
    const inShop = await getGameState(app, room.code);
    expect(inShop.body.room.currentStage).toBe('SHOP');
    expect(inShop.body.room.blockedQuestionsCount).toBe(6);
    expect(inShop.body.room.currentShopRound).toBe(1);
    // The turn moved on the shop entry (Этап2 §16).
    const turnInShop = inShop.body.room.currentTeamId as string;

    // shop-opened is the LAST broadcast, after board-state-updated.
    const names = events.map((event) => event.event);
    expect(names[names.length - 1]).toBe('server:commerce:shop-opened');
    expect(names).not.toContain('server:commerce:shop-final-opened');
    expect(names.indexOf('server:commerce:shop-opened')).toBeGreaterThan(
      names.lastIndexOf('server:gameplay:board-state-updated'),
    );
    const openedPayload = events[events.length - 1].payload as {
      roomId: string;
      currentShopRound: number;
      startedAt: Date;
      endsAt: Date;
      minClosableAt: Date;
    };
    expect(openedPayload.roomId).toBe(inShop.body.room.id);
    expect(openedPayload.currentShopRound).toBe(1);
    expect(openedPayload.endsAt.getTime()).toBeGreaterThan(
      openedPayload.startedAt.getTime(),
    );
    expect(openedPayload.minClosableAt.getTime()).toBeLessThan(
      openedPayload.endsAt.getTime(),
    );

    // Catalog: all six seeded items, available, no QR leakage.
    const items = await getShopItems(app, room.code);
    expect(items.status).toBe(200);
    expect(items.body).toHaveLength(6);
    expect(
      items.body.every((item: { available: boolean }) => item.available),
    ).toBe(true);
    expect(JSON.stringify(items.body)).not.toContain('publicUrl');

    // Round: first regular shop, timer running.
    const round = await getShopRound(app, room.code);
    expect(round.status).toBe(200);
    expect(round.body.currentShopRound).toBe(1);
    expect(round.body.currentStage).toBe('SHOP');
    expect(round.body.isFinalShop).toBe(false);
    expect(round.body.timer.status).toBe('RUNNING');

    // Battle actions are stage-gated out of SHOP.
    const board = await getBoard(app, room.code);
    const freeCell = board.body.cells.find(
      (candidate: { state: string }) => candidate.state === 'AVAILABLE',
    );
    const selectInShop = await selectCell(
      app,
      room.code,
      tokenByTeam[turnInShop],
      freeCell.id,
    );
    expect(selectInShop.status).toBe(409);

    // Close: host-only, and not before the 1s minimum.
    expect((await closeShop(app, room.code, 'not-the-host')).status).toBe(403);
    const early = await closeShop(app, room.code, room.hostToken);
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('SHOP_MINIMUM_TIME_NOT_ELAPSED');

    await sleep(1_100);
    events.length = 0;
    const closed = await closeShop(app, room.code, room.hostToken);
    expect(closed.status).toBe(200);
    expect(closed.body).toEqual({ currentStage: 'GAME_BOARD' });
    const closedEvent = events.find(
      (event) => event.event === 'server:commerce:shop-closed',
    );
    expect(closedEvent).toBeDefined();
    expect(closedEvent?.payload).toMatchObject({
      currentShopRound: 1,
      nextStage: 'GAME_BOARD',
    });

    // The turn survived the shop; the 7th cycle plays on (7 % 6 !== 0).
    const after = await getGameState(app, room.code);
    expect(after.body.room.currentStage).toBe('GAME_BOARD');
    expect(after.body.room.currentTeamId).toBe(turnInShop);
    await playCycle(room, tokenByTeam);
    const seventh = await getGameState(app, room.code);
    expect(seventh.body.room.currentStage).toBe('GAME_BOARD');
    expect(seventh.body.room.blockedQuestionsCount).toBe(7);
  });

  it('lets the window expire and bridges via the same close endpoint', async () => {
    const { room, roomId, tokenByTeam } = await startBattle();
    // Park the room one block before the SECOND threshold (12 = 2 × 6).
    await presetRoomCounters(roomId, { blocked: 11, shopRound: 1 });

    events.length = 0;
    await playCycle(room, tokenByTeam);
    const opened = events[events.length - 1];
    expect(opened.event).toBe('server:commerce:shop-opened');
    expect(opened.payload).toMatchObject({ currentShopRound: 2 });

    // Past the 2s window: EXPIRED reads closable, the close bridges it.
    await sleep(2_100);
    const round = await getShopRound(app, room.code);
    expect(round.status).toBe(200);
    expect(round.body.timer.status).toBe('EXPIRED');
    expect(round.body.timer.closable).toBe(true);

    const closed = await closeShop(app, room.code, room.hostToken);
    expect(closed.status).toBe(200);
    expect(closed.body.currentStage).toBe('GAME_BOARD');
  });

  it('opens the FINAL shop on the exhausted board and closes on to presentations', async () => {
    const { room, roomId, tokenByTeam } = await startBattle();
    // Preset 29, NOT 30: incrementBlockedQuestions guards blocked === total,
    // so the 30th block must come from one live cycle.
    await presetRoomCounters(roomId, { blocked: 29, shopRound: 4 });

    events.length = 0;
    await playCycle(room, tokenByTeam);

    const names = events.map((event) => event.event);
    expect(names[names.length - 1]).toBe('server:commerce:shop-final-opened');
    expect(names).not.toContain('server:commerce:shop-opened');
    expect(events[events.length - 1].payload).toMatchObject({
      currentShopRound: 5,
    });

    const round = await getShopRound(app, room.code);
    expect(round.status).toBe(200);
    expect(round.body.isFinalShop).toBe(true);
    expect(round.body.currentShopRound).toBe(5);

    await sleep(1_100);
    events.length = 0;
    const closed = await closeShop(app, room.code, room.hostToken);
    expect(closed.status).toBe(200);
    expect(closed.body.currentStage).toBe('PRESENTATION_PREPARATION');

    // The stage reached the DB and shop-closed carried it.
    const state = await getGameState(app, room.code);
    expect(state.body.room.currentStage).toBe('PRESENTATION_PREPARATION');
    const closedEvent = events.find(
      (event) => event.event === 'server:commerce:shop-closed',
    );
    expect(closedEvent?.payload).toMatchObject({
      currentShopRound: 5,
      nextStage: 'PRESENTATION_PREPARATION',
    });
  });
});

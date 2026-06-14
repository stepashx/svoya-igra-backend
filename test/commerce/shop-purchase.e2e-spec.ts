import { INestApplication } from '@nestjs/common';
import { ShopTimerRegistry } from '../../src/game-session/application/timers';
import { CapturedEvent, createE2EApp } from '../utils/create-e2e-app';
import {
  FAST_SHOP_TIMER,
  playCycle,
  sleep,
  startBattle,
} from '../utils/battle-driver';
import {
  closeDbWritePool,
  presetRoomCounters,
  presetTeamScores,
} from '../utils/db-write';
import {
  closeDbReadPool,
  readInventoryItems,
  readPurchases,
  readTeamScores,
} from '../utils/db-read';
import { closeTruncatePool, truncateLobby } from '../utils/db-truncate';
import { getGameState } from '../utils/gameplay-client';
import { joinRoom, joinTeam } from '../utils/lobby-client';
import {
  getPurchases,
  getShopItems,
  getShopRound,
  getTeamInventory,
  getTeamQrTools,
  purchaseItem,
} from '../utils/shop-client';

interface CatalogItem {
  id: string;
  title: string;
  price: number;
  qrToolId: string;
  available: boolean;
}

/**
 * Purchase + inventory + QR flow over real Postgres (sub-stage 8.3). The shop
 * is reached cheaply by PRESETTING the room counters one block short of a
 * threshold and playing ONE live cycle (the 8.2 battle-driver, shared). Team
 * balances are preset AFTER entering the shop — the live entry cycle awards
 * points, so an earlier preset would be overwritten.
 *
 * R3 privacy is asserted on every purchase: the QR `publicUrl` reaches the
 * captain (REST reply) and the team (inventory reads) but NEVER a room-wide
 * broadcast — every recorded `emitToRoom` payload is checked.
 */
describe('Shop purchase (e2e)', () => {
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
    await closeDbReadPool();
  });

  beforeEach(async () => {
    await truncateLobby();
    events.length = 0;
  });

  /**
   * Drive a fresh game into SHOP via a counter preset + one live cycle, then
   * resolve the active team and the NON-active "buyer" team (whose captain will
   * purchase for their own team).
   */
  const enterShop = async (preset: { blocked: number; shopRound: number }) => {
    const battle = await startBattle(app);
    await presetRoomCounters(battle.roomId, preset);
    await playCycle(app, battle.room, battle.tokenByTeam);

    const state = await getGameState(app, battle.room.code);
    expect(state.body.room.currentStage).toBe('SHOP');
    const activeTeamId = state.body.room.currentTeamId as string;
    const teamIds = Object.keys(battle.tokenByTeam);
    const buyerTeamId = teamIds.find((id) => id !== activeTeamId) as string;
    return {
      ...battle,
      activeTeamId,
      buyerTeamId,
      buyerToken: battle.tokenByTeam[buyerTeamId],
      activeToken: battle.tokenByTeam[activeTeamId],
    };
  };

  const firstItem = async (code: string): Promise<CatalogItem> => {
    const items = await getShopItems(app, code);
    expect(items.status).toBe(200);
    return items.body[0] as CatalogItem;
  };

  it('lets a non-active team captain buy for their OWN team', async () => {
    const shop = await enterShop({ blocked: 5, shopRound: 0 });
    await presetTeamScores(shop.buyerTeamId, {
      earnedScore: 1000,
      balance: 1000,
    });
    const item = await firstItem(shop.room.code);

    events.length = 0;
    const res = await purchaseItem(
      app,
      shop.room.code,
      shop.buyerToken,
      item.id,
    );

    // 200 reply to the captain — receiver is the buyer's OWN (non-active) team.
    expect(res.status).toBe(200);
    expect(res.body.purchase).toMatchObject({
      teamId: shop.buyerTeamId,
      shopItemId: item.id,
      price: item.price,
    });
    expect(shop.buyerTeamId).not.toBe(shop.activeTeamId);
    expect(res.body.balance).toBe(1000 - item.price);
    // The captain reply DOES carry the QR publicUrl.
    expect(res.body.qrTool.id).toBe(item.qrToolId);
    expect(typeof res.body.qrTool.publicUrl).toBe('string');
    expect(res.body.qrTool.publicUrl.length).toBeGreaterThan(0);
    expect(res.body.inventoryItem.qrToolId).toBe(item.qrToolId);

    // DB: balance debited, earnedScore intact; one purchase + one inventory row.
    expect(await readTeamScores(shop.buyerTeamId)).toEqual({
      earned_score: 1000,
      balance: 1000 - item.price,
    });
    const purchases = await readPurchases(shop.roomId);
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({
      team_id: shop.buyerTeamId,
      shop_item_id: item.id,
      price: item.price,
    });
    const inventory = await readInventoryItems(shop.roomId);
    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      team_id: shop.buyerTeamId,
      shop_item_id: item.id,
      qr_tool_id: item.qrToolId,
    });

    // Recorder: exactly the four room broadcasts, NONE carrying the QR.
    expect(events.map((event) => event.event)).toEqual([
      'server:gameplay:score-changed',
      'server:commerce:shop-item-purchased',
      'server:commerce:shop-item-unavailable',
      'server:commerce:shop-state-updated',
    ]);
    const scoreChanged = events[0].payload as {
      teamId: string;
      balance: number;
      delta: number;
    };
    expect(scoreChanged.teamId).toBe(shop.buyerTeamId);
    expect(scoreChanged.delta).toBe(-item.price);
    expect(scoreChanged.balance).toBe(1000 - item.price);
    // R3: no room payload leaks the QR publicUrl.
    const roomPayloads = JSON.stringify(events);
    expect(roomPayloads).not.toContain('publicUrl');
    expect(roomPayloads).not.toContain(res.body.qrTool.publicUrl);
  });

  it('marks the bought item unavailable and lists it among the purchases', async () => {
    const shop = await enterShop({ blocked: 5, shopRound: 0 });
    await presetTeamScores(shop.buyerTeamId, {
      earnedScore: 1000,
      balance: 1000,
    });
    const item = await firstItem(shop.room.code);
    expect(
      (await purchaseItem(app, shop.room.code, shop.buyerToken, item.id))
        .status,
    ).toBe(200);

    const items = await getShopItems(app, shop.room.code);
    expect(items.status).toBe(200);
    const bought = (items.body as CatalogItem[]).find((i) => i.id === item.id);
    expect(bought?.available).toBe(false);
    expect(
      (items.body as CatalogItem[])
        .filter((i) => i.id !== item.id)
        .every((i) => i.available),
    ).toBe(true);
    // No QR leakage in the public catalog.
    expect(JSON.stringify(items.body)).not.toContain('publicUrl');

    const purchases = await getPurchases(app, shop.room.code);
    expect(purchases.status).toBe(200);
    expect(purchases.body).toHaveLength(1);
    expect(purchases.body[0]).toMatchObject({
      teamId: shop.buyerTeamId,
      shopItemId: item.id,
      price: item.price,
    });
    expect(JSON.stringify(purchases.body)).not.toContain('publicUrl');
  });

  it('serves the inventory + QR tools to the team and host, not other teams', async () => {
    const shop = await enterShop({ blocked: 5, shopRound: 0 });
    await presetTeamScores(shop.buyerTeamId, {
      earnedScore: 1000,
      balance: 1000,
    });
    const item = await firstItem(shop.room.code);
    await purchaseItem(app, shop.room.code, shop.buyerToken, item.id);

    // The team's own member reads its inventory (title + QR, no price).
    const mine = await getTeamInventory(app, shop.room.code, shop.buyerTeamId, {
      playerToken: shop.buyerToken,
    });
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ shopItemId: item.id });
    expect(mine.body[0].qrTool.publicUrl.length).toBeGreaterThan(0);
    expect(mine.body[0]).not.toHaveProperty('price');

    // The host reads any team's inventory.
    const byHost = await getTeamInventory(
      app,
      shop.room.code,
      shop.buyerTeamId,
      { hostToken: shop.room.hostToken },
    );
    expect(byHost.status).toBe(200);
    expect(byHost.body).toHaveLength(1);

    // Another team's member is forbidden.
    const byOther = await getTeamInventory(
      app,
      shop.room.code,
      shop.buyerTeamId,
      { playerToken: shop.activeToken },
    );
    expect(byOther.status).toBe(403);

    // QR tools: team member 200, other team 403.
    const qrMine = await getTeamQrTools(app, shop.room.code, shop.buyerTeamId, {
      playerToken: shop.buyerToken,
    });
    expect(qrMine.status).toBe(200);
    expect(qrMine.body).toHaveLength(1);
    expect(qrMine.body[0].publicUrl.length).toBeGreaterThan(0);

    const qrOther = await getTeamQrTools(
      app,
      shop.room.code,
      shop.buyerTeamId,
      {
        playerToken: shop.activeToken,
      },
    );
    expect(qrOther.status).toBe(403);
  });

  it('rejects a repeated purchase of the same item (409)', async () => {
    const shop = await enterShop({ blocked: 5, shopRound: 0 });
    await presetTeamScores(shop.buyerTeamId, {
      earnedScore: 1000,
      balance: 1000,
    });
    const item = await firstItem(shop.room.code);

    expect(
      (await purchaseItem(app, shop.room.code, shop.buyerToken, item.id))
        .status,
    ).toBe(200);
    const again = await purchaseItem(
      app,
      shop.room.code,
      shop.buyerToken,
      item.id,
    );
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ITEM_ALREADY_PURCHASED');
    expect(await readPurchases(shop.roomId)).toHaveLength(1);
  });

  it('rejects an unaffordable purchase and records nothing (409)', async () => {
    const shop = await enterShop({ blocked: 5, shopRound: 0 });
    const item = await firstItem(shop.room.code);
    await presetTeamScores(shop.buyerTeamId, {
      earnedScore: 1000,
      balance: item.price - 1, // one short
    });

    const res = await purchaseItem(
      app,
      shop.room.code,
      shop.buyerToken,
      item.id,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await readPurchases(shop.roomId)).toEqual([]);
    expect(await readInventoryItems(shop.roomId)).toEqual([]);
    expect(await readTeamScores(shop.buyerTeamId)).toEqual({
      earned_score: 1000,
      balance: item.price - 1,
    });
  });

  it('rejects a rank-and-file member who is not the captain (403)', async () => {
    const shop = await enterShop({ blocked: 5, shopRound: 0 });
    await presetTeamScores(shop.buyerTeamId, {
      earnedScore: 1000,
      balance: 1000,
    });
    const item = await firstItem(shop.room.code);

    // A non-captain joins the buyer team (Join is not stage-gated — the §5
    // team-hopping MVP risk; the guard is correct for the membership it sees).
    const carol = await joinRoom(app, shop.room.code, 'Carol');
    await joinTeam(app, shop.room.code, shop.buyerTeamId, carol.token);

    const res = await purchaseItem(app, shop.room.code, carol.token, item.id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_TEAM_CAPTAIN');
    expect(await readPurchases(shop.roomId)).toEqual([]);
  });

  it('rejects a purchase outside SHOP (409)', async () => {
    const battle = await startBattle(app); // GAME_BOARD, not SHOP
    const captainToken = Object.values(battle.tokenByTeam)[0];

    const res = await purchaseItem(
      app,
      battle.room.code,
      captainToken,
      '00000000-0000-4000-8000-000000000000',
    );
    expect(res.status).toBe(409);
  });

  it('rejects a non-uuid shopItemId before reaching the use case (400)', async () => {
    const battle = await startBattle(app);
    const captainToken = Object.values(battle.tokenByTeam)[0];

    const res = await purchaseItem(
      app,
      battle.room.code,
      captainToken,
      'not-a-uuid',
    );
    expect(res.status).toBe(400);
  });

  it('allows a purchase in the FINAL shop (exhausted board)', async () => {
    const shop = await enterShop({ blocked: 29, shopRound: 4 });
    const round = await getShopRound(app, shop.room.code);
    expect(round.body.isFinalShop).toBe(true);
    await presetTeamScores(shop.buyerTeamId, {
      earnedScore: 1000,
      balance: 1000,
    });
    const item = await firstItem(shop.room.code);

    const res = await purchaseItem(
      app,
      shop.room.code,
      shop.buyerToken,
      item.id,
    );
    expect(res.status).toBe(200);
    expect(await readPurchases(shop.roomId)).toHaveLength(1);
  });

  it('allows a purchase after the shop window has EXPIRED', async () => {
    const shop = await enterShop({ blocked: 5, shopRound: 0 });
    await presetTeamScores(shop.buyerTeamId, {
      earnedScore: 1000,
      balance: 1000,
    });
    const item = await firstItem(shop.room.code);

    // Past the 2s FAST window: the timer reads EXPIRED, but buying is unaffected.
    await sleep(2_100);
    const round = await getShopRound(app, shop.room.code);
    expect(round.body.timer.status).toBe('EXPIRED');

    const res = await purchaseItem(
      app,
      shop.room.code,
      shop.buyerToken,
      item.id,
    );
    expect(res.status).toBe(200);
  });

  it('settles two concurrent purchases of one item: exactly one wins', async () => {
    const shop = await enterShop({ blocked: 5, shopRound: 0 });
    await presetTeamScores(shop.buyerTeamId, {
      earnedScore: 1000,
      balance: 1000,
    });
    await presetTeamScores(shop.activeTeamId, {
      earnedScore: 1000,
      balance: 1000,
    });
    const item = await firstItem(shop.room.code);

    // Both captains race for the SAME item; the lock + unique index pick one.
    const [a, b] = await Promise.all([
      purchaseItem(app, shop.room.code, shop.buyerToken, item.id),
      purchaseItem(app, shop.room.code, shop.activeToken, item.id),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await readPurchases(shop.roomId)).toHaveLength(1);
  });
});

import { ShopCatalogEntry } from '../../../commerce/application/queries';
import {
  ItemAlreadyPurchasedError,
  QrToolNotFoundError,
  ShopItemNotFoundError,
} from '../../../commerce/domain/errors';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import {
  InsufficientBalanceError,
  NotTeamCaptainError,
  RoomNotActiveError,
  RoomNotFoundError,
} from '../../domain/errors';
import { Score } from '../../domain/value-objects';
import { CommerceEvent, GameplayEvent, shopCatalogSummary } from '../events';
import { PurchaseItemUseCase } from './purchase-item.use-case';
import {
  FIXED_NOW,
  makeClock,
  makeIdGenerator,
  makeInventoryRepo,
  makePlayer,
  makePlayerRepo,
  makePurchaseRepo,
  makeQrTool,
  makeQrToolRepo,
  makeRealtime,
  makeRoom,
  makeRoomRepo,
  makeShopItem,
  makeShopItemRepo,
  makeTeam,
  makeTeamRealtime,
  makeTeamRepo,
  makeTransactionPort,
} from './lobby-test-doubles';

describe('PurchaseItemUseCase', () => {
  const INPUT = {
    roomId: 'room-1',
    shopItemId: 'shop-item-1',
    actingPlayerId: 'captain-1',
  };

  /**
   * A room parked in SHOP. The buyer is the captain of team-1; the active
   * turn-holder is the DIFFERENT team-2 — proving the buy goes to the actor's
   * own team, not the current team.
   */
  const build = (
    opts: {
      currentTeamId?: string;
      balance?: number;
      earnedScore?: number;
      price?: number;
    } = {},
  ) => {
    const {
      currentTeamId = 'team-2',
      balance = 500,
      earnedScore = 700,
      price = 100,
    } = opts;

    const rooms = makeRoomRepo();
    const teams = makeTeamRepo();
    const players = makePlayerRepo();
    const shopItems = makeShopItemRepo();
    const purchases = makePurchaseRepo();
    const inventory = makeInventoryRepo();
    const qrTools = makeQrToolRepo();
    const realtime = makeRealtime();
    const teamRealtime = makeTeamRealtime();

    const room = makeRoom({
      currentStage: 'SHOP',
      currentTeamId,
      blockedQuestionsCount: 6,
      currentShopRound: 1,
    });
    const team = makeTeam({
      id: 'team-1',
      captainPlayerId: 'captain-1',
      balance: Score.create(balance),
      earnedScore: Score.create(earnedScore),
    });
    const player = makePlayer({ id: 'captain-1', teamId: 'team-1' });
    const shopItem = makeShopItem({
      id: 'shop-item-1',
      price,
      qrToolId: 'qr-1',
    });
    const otherItem = makeShopItem({
      id: 'shop-item-2',
      title: 'Товар 2',
      price: 200,
      qrToolId: 'qr-2',
    });
    const qrTool = makeQrTool({ id: 'qr-1' });
    const catalog: ShopCatalogEntry[] = [
      { item: shopItem, available: false },
      { item: otherItem, available: true },
    ];

    rooms.findById.mockResolvedValue(room);
    teams.findById.mockResolvedValue(team);
    players.findById.mockResolvedValue(player);
    shopItems.findById.mockResolvedValue(shopItem);
    qrTools.findById.mockResolvedValue(qrTool);
    const shopQuery = {
      listCatalog: jest.fn().mockResolvedValue(catalog),
    };

    const uc = new PurchaseItemUseCase(
      makeTransactionPort(),
      rooms,
      teams,
      players,
      shopItems,
      purchases,
      inventory,
      qrTools,
      makeIdGenerator(),
      makeClock(),
      realtime,
      teamRealtime,
      shopQuery as never,
    );

    return {
      uc,
      rooms,
      teams,
      players,
      shopItems,
      purchases,
      inventory,
      qrTools,
      realtime,
      teamRealtime,
      shopQuery,
      room,
      team,
      qrTool,
      catalog,
    };
  };

  it('does NOT take the ShopTimerRegistry — the stage gate alone guards SHOP', () => {
    // 13 ctor params; an EXPIRED window must not block a buy, so no shop timer.
    expect(PurchaseItemUseCase.length).toBe(13);
  });

  it('records the purchase + inventory and debits ONLY the balance (§14.7)', async () => {
    const ctx = build();

    const result = await ctx.uc.execute(INPUT);

    // Persistence order: purchase (race arbiter) → inventory → team debit.
    expect(ctx.purchases.create).toHaveBeenCalledTimes(1);
    expect(ctx.inventory.create).toHaveBeenCalledTimes(1);
    expect(ctx.teams.update).toHaveBeenCalledTimes(1);
    const purchaseOrder = ctx.purchases.create.mock.invocationCallOrder[0];
    const inventoryOrder = ctx.inventory.create.mock.invocationCallOrder[0];
    const teamOrder = ctx.teams.update.mock.invocationCallOrder[0];
    expect(purchaseOrder).toBeLessThan(inventoryOrder);
    expect(inventoryOrder).toBeLessThan(teamOrder);

    // Price snapshot + receiver = the actor's own team (team-1, not team-2).
    const purchase = ctx.purchases.create.mock.calls[0][0];
    expect(purchase.teamId).toBe('team-1');
    expect(purchase.shopItemId).toBe('shop-item-1');
    expect(purchase.price).toBe(100);
    const inventoryItem = ctx.inventory.create.mock.calls[0][0];
    expect(inventoryItem.teamId).toBe('team-1');
    expect(inventoryItem.qrToolId).toBe('qr-1');

    // earnedScore intact, balance shrunk by the price.
    expect(ctx.team.earnedScore.value).toBe(700);
    expect(ctx.team.balance.value).toBe(400);
    expect(result.balance).toBe(400);
  });

  it('emits the four room broadcasts in order with the negative score delta', async () => {
    const ctx = build();

    await ctx.uc.execute(INPUT);

    const events = ctx.realtime.emitToRoom.mock.calls.map(([, event]) => event);
    expect(events).toEqual([
      GameplayEvent.ScoreChanged,
      CommerceEvent.ShopItemPurchased,
      CommerceEvent.ShopItemUnavailable,
      CommerceEvent.ShopStateUpdated,
    ]);

    expect(ctx.realtime.emitToRoom).toHaveBeenNthCalledWith(
      1,
      'room-1',
      GameplayEvent.ScoreChanged,
      {
        roomId: 'room-1',
        teamId: 'team-1',
        earnedScore: 700,
        balance: 400,
        delta: -100,
      },
    );
    expect(ctx.realtime.emitToRoom).toHaveBeenNthCalledWith(
      2,
      'room-1',
      CommerceEvent.ShopItemPurchased,
      {
        roomId: 'room-1',
        teamId: 'team-1',
        shopItemId: 'shop-item-1',
        price: 100,
        purchasedAt: FIXED_NOW,
      },
    );
    expect(ctx.realtime.emitToRoom).toHaveBeenNthCalledWith(
      3,
      'room-1',
      CommerceEvent.ShopItemUnavailable,
      { roomId: 'room-1', shopItemId: 'shop-item-1' },
    );
    expect(ctx.realtime.emitToRoom).toHaveBeenNthCalledWith(
      4,
      'room-1',
      CommerceEvent.ShopStateUpdated,
      { roomId: 'room-1', items: ctx.catalog.map(shopCatalogSummary) },
    );
  });

  it('emits inventory-updated to the TEAM, with publicUrl, AFTER the room block', async () => {
    const ctx = build();

    await ctx.uc.execute(INPUT);

    expect(ctx.teamRealtime.emitToTeam).toHaveBeenCalledTimes(1);
    const [teamId, event, payload] = ctx.teamRealtime.emitToTeam.mock.calls[0];
    expect(teamId).toBe('team-1');
    expect(event).toBe(CommerceEvent.InventoryUpdated);
    expect(payload).toEqual({
      roomId: 'room-1',
      teamId: 'team-1',
      inventoryItem: {
        id: expect.any(String),
        shopItemId: 'shop-item-1',
        qrToolId: 'qr-1',
        addedAt: FIXED_NOW,
      },
      qrTool: {
        id: 'qr-1',
        title: ctx.qrTool.title,
        description: ctx.qrTool.description,
        fileFormat: 'SVG',
        publicUrl: ctx.qrTool.publicUrl,
      },
    });

    // The team emit happens after all four room emits.
    const lastRoomOrder = Math.max(
      ...ctx.realtime.emitToRoom.mock.invocationCallOrder,
    );
    expect(
      ctx.teamRealtime.emitToTeam.mock.invocationCallOrder[0],
    ).toBeGreaterThan(lastRoomOrder);
  });

  it('NEVER leaks the QR publicUrl into any room payload (R3)', async () => {
    const ctx = build();

    await ctx.uc.execute(INPUT);

    const allRoomPayloads = JSON.stringify(
      ctx.realtime.emitToRoom.mock.calls.map(([, , payload]) => payload),
    );
    expect(allRoomPayloads).not.toContain('publicUrl');
    expect(allRoomPayloads).not.toContain('_publicUrl');
    expect(allRoomPayloads).not.toContain(ctx.qrTool.publicUrl);
  });

  it('lets a captain of a NON-active team buy for their OWN team', async () => {
    // Active turn-holder is team-2; the buyer captains team-1 and receives it.
    const ctx = build({ currentTeamId: 'team-2' });

    const result = await ctx.uc.execute(INPUT);

    expect(result.purchase.teamId).toBe('team-1');
    expect(ctx.realtime.emitToRoom.mock.calls[0][2]).toMatchObject({
      teamId: 'team-1',
    });
    expect(ctx.teamRealtime.emitToTeam.mock.calls[0][0]).toBe('team-1');
  });

  it('rejects an insufficient balance with no record and no emission (409)', async () => {
    const ctx = build({ balance: 50, price: 100 });

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      InsufficientBalanceError,
    );

    expect(ctx.purchases.create).not.toHaveBeenCalled();
    expect(ctx.inventory.create).not.toHaveBeenCalled();
    expect(ctx.teams.update).not.toHaveBeenCalled();
    expect(ctx.realtime.emitToRoom).not.toHaveBeenCalled();
    expect(ctx.teamRealtime.emitToTeam).not.toHaveBeenCalled();
    expect(ctx.team.balance.value).toBe(50);
  });

  it('rejects an already-purchased item at the pre-check, before any debit (409)', async () => {
    const ctx = build();
    ctx.purchases.existsByRoomAndShopItem.mockResolvedValue(true);
    const debitSpy = jest.spyOn(ctx.team, 'debitBalance');

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      ItemAlreadyPurchasedError,
    );

    expect(debitSpy).not.toHaveBeenCalled();
    expect(ctx.purchases.create).not.toHaveBeenCalled();
    expect(ctx.realtime.emitToRoom).not.toHaveBeenCalled();
  });

  it('settles a concurrent race: a rejected create writes nothing further', async () => {
    const ctx = build();
    // The pre-check passed but the unique index lost the race.
    ctx.purchases.create.mockRejectedValue(new ItemAlreadyPurchasedError());

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      ItemAlreadyPurchasedError,
    );

    expect(ctx.inventory.create).not.toHaveBeenCalled();
    expect(ctx.teams.update).not.toHaveBeenCalled();
    expect(ctx.realtime.emitToRoom).not.toHaveBeenCalled();
    expect(ctx.teamRealtime.emitToTeam).not.toHaveBeenCalled();
  });

  it('rejects a non-captain of the team (403)', async () => {
    const ctx = build();
    ctx.teams.findById.mockResolvedValue(
      makeTeam({ id: 'team-1', captainPlayerId: 'someone-else' }),
    );

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      NotTeamCaptainError,
    );
    expect(ctx.purchases.create).not.toHaveBeenCalled();
  });

  it('rejects a player with no team (403)', async () => {
    const ctx = build();
    ctx.players.findById.mockResolvedValue(makePlayer({ id: 'captain-1' }));

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      NotTeamCaptainError,
    );
  });

  it('rejects an unknown shop item (404)', async () => {
    const ctx = build();
    ctx.shopItems.findById.mockResolvedValue(null);

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      ShopItemNotFoundError,
    );
    expect(ctx.purchases.create).not.toHaveBeenCalled();
  });

  it('fails loudly if the paired QR tool is missing (404, defensive)', async () => {
    const ctx = build();
    ctx.qrTools.findById.mockResolvedValue(null);

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      QrToolNotFoundError,
    );
    // The purchase already wrote, but the inventory entry never did.
    expect(ctx.inventory.create).not.toHaveBeenCalled();
  });

  it('rejects buying outside SHOP (409)', async () => {
    const ctx = build();
    ctx.rooms.findById.mockResolvedValue(
      makeRoom({ currentStage: 'GAME_BOARD' }),
    );

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      UnexpectedGameStageError,
    );
  });

  it('rejects an unknown room (404)', async () => {
    const ctx = build();
    ctx.rooms.findById.mockResolvedValue(null);

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      RoomNotFoundError,
    );
  });

  it('rejects a room that is not ACTIVE (409)', async () => {
    const ctx = build();
    ctx.rooms.findById.mockResolvedValue(
      makeRoom({
        currentStage: 'SHOP',
        status: 'CLOSED',
        finishedAt: FIXED_NOW,
      }),
    );

    await expect(ctx.uc.execute(INPUT)).rejects.toBeInstanceOf(
      RoomNotActiveError,
    );
  });
});

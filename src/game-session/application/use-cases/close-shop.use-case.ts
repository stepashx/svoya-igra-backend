import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import {
  RoomNotActiveError,
  RoomNotFoundError,
  ShopMinimumTimeNotElapsedError,
} from '../../domain/errors';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { GameStage } from '../../domain/types';
import { ShopTimerRegistry } from '../timers';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { CommerceEvent } from '../events';

export interface CloseShopInput {
  roomId: string;
}

export interface CloseShopResult {
  stage: GameStage;
}

/**
 * The host closes the shop (§14.8, §15.8). One endpoint serves both the close
 * button and the expired countdown — there is no server scheduler, the client
 * counts down to `endsAt` and the host calls the same POST (the
 * {@link AdvanceOnTimeoutUseCase} pattern). Legal only in SHOP while the
 * {@link ShopTimerRegistry} read is `closable`: a RUNNING timer before
 * `minClosableAt` rejects with {@link ShopMinimumTimeNotElapsedError} (409),
 * while IDLE (post-restart) and EXPIRED reads always close.
 *
 * A regular shop exits to GAME_BOARD; the final shop (derived
 * {@link Room.isBoardExhausted}) moves on to PRESENTATION_PREPARATION. The
 * turn does NOT move — it already moved when ReviewAnswer entered the shop
 * (Этап2 §16) — so no `game-turn-changed` fires; the timer entry is cleared
 * and `shop-closed` broadcasts room-wide with the stage the room lands in.
 */
@Injectable()
export class CloseShopUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    private readonly shopTimer: ShopTimerRegistry,
  ) {}

  async execute(input: CloseShopInput): Promise<CloseShopResult> {
    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      if (room.currentStage !== 'SHOP') {
        throw new UnexpectedGameStageError();
      }
      if (!this.shopTimer.read(room.id, this.clock.now()).closable) {
        throw new ShopMinimumTimeNotElapsedError();
      }

      if (room.isBoardExhausted) {
        room.finalizeShop();
      } else {
        room.exitShop();
      }
      await this.rooms.update(room);
      this.shopTimer.clear(room.id);

      this.realtime.emitToRoom(room.id, CommerceEvent.ShopClosed, {
        roomId: room.id,
        currentShopRound: room.currentShopRound,
        nextStage: room.currentStage,
      });

      return { stage: room.currentStage };
    });
  }
}

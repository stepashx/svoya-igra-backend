import { Inject, Injectable } from '@nestjs/common';
import { CLOCK_PORT, ClockPort } from '../../../core/ports/clock.port';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import { ROOM_REPOSITORY_PORT, RoomRepositoryPort } from '../../domain/ports';
import { PresentationEvent } from '../events';
import { TRANSACTION_PORT, TransactionPort } from '../ports';
import { PresentationTimerRegistry, PresentationTimerState } from '../timers';

export interface StartPresentationPreparationInput {
  roomId: string;
}

export interface StartPresentationPreparationResult {
  timer: PresentationTimerState;
}

/**
 * The host opens (or re-opens) presentation preparation (§14.9, §15.10) — the
 * first emitter of the §16.6 presentation broadcasts. The room is ALREADY in
 * PRESENTATION_PREPARATION (the final-shop close in Этап 8 parked it there), so
 * — unlike {@link CloseShopUseCase}, which MOVES the stage — this use case
 * changes NO room state: there is no Room mutator and no `rooms.update`. It only
 * validates the stage, (re)starts the in-memory {@link PresentationTimerRegistry}
 * and announces it.
 *
 * Idempotent-by-restart: a repeat call REPLACES the timer with fresh stamps and
 * re-emits both events (clients resync to the new deadline) — there is no
 * "already started" error. The turn does NOT move; PRESENTATION_PREPARATION is a
 * terminal stage until StartDefense (Stage 10), so STAGE_FLOW is untouched.
 *
 * Emission order is fixed: `preparation-started` first (the stage opened), then
 * `timer-started` (the deadline). Both are room-wide and PUBLIC — presentation
 * payloads carry no secret (Этап2 §10.15, the opposite of the §16.5 QR secrecy),
 * so no team-gating is applied. They fire inside the transaction, as the shop
 * lifecycle does; there is nothing to commit here, so the emit→commit-fail risk
 * does not arise.
 */
@Injectable()
export class StartPresentationPreparationUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
    private readonly presentationTimer: PresentationTimerRegistry,
  ) {}

  async execute(
    input: StartPresentationPreparationInput,
  ): Promise<StartPresentationPreparationResult> {
    return this.tx.run(async () => {
      await this.rooms.acquireRoomLock(input.roomId);

      const room = await this.rooms.findById(input.roomId);
      if (!room) {
        throw new RoomNotFoundError();
      }
      if (room.status !== 'ACTIVE') {
        throw new RoomNotActiveError();
      }
      if (room.currentStage !== 'PRESENTATION_PREPARATION') {
        throw new UnexpectedGameStageError();
      }

      // No stage change, no mutator, no rooms.update — the room is already
      // parked here. Just (re)start the timer (REPLACE on a repeat call).
      const timer = this.presentationTimer.start(room.id, this.clock.now());

      this.realtime.emitToRoom(room.id, PresentationEvent.PreparationStarted, {
        roomId: room.id,
        stage: room.currentStage,
      });
      this.realtime.emitToRoom(room.id, PresentationEvent.TimerStarted, {
        roomId: room.id,
        startedAt: timer.startedAt,
        endsAt: timer.endsAt,
      });

      return { timer };
    });
  }
}

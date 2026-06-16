import { Inject, Injectable } from '@nestjs/common';
import {
  REALTIME_EVENTS_PORT,
  RealtimeEventsPort,
} from '../../../core/ports/realtime-events.port';
import { UnexpectedGameStageError } from '../../../gameplay/domain/errors';
import { RoomNotActiveError, RoomNotFoundError } from '../../domain/errors';
import {
  ROOM_REPOSITORY_PORT,
  RoomRepositoryPort,
  TEAM_REPOSITORY_PORT,
  TeamRepositoryPort,
} from '../../domain/ports';
import { GameStage } from '../../domain/types';
import { DefenseEvent } from '../events';
import { TRANSACTION_PORT, TransactionPort } from '../ports';

export interface StartDefenseInput {
  roomId: string;
}

export interface StartDefenseResult {
  stage: GameStage;
  currentPresenterTeamId: string;
  order: string[];
}

/**
 * The host opens the presentation defenses (§10.16, §15.7) — the first emitter
 * of the §16.7 defense broadcasts. Legal only in PRESENTATION_PREPARATION (the
 * room is parked there after preparation/upload, 9.2/9.3).
 *
 * Unlike {@link StartPresentationPreparationUseCase} (9.2, which changed NO room
 * state), this MOVES the stage exactly as {@link CloseShopUseCase}: it
 * `transitionTo('PRESENTATION_DEFENSE')`, points the room at the FIRST presenter
 * and persists with `rooms.update`. The defense state is fully DERIVED from the
 * existing columns — there is no new table: the current presenter is
 * `Room.currentTeamId` (the same pointer the battle turn uses) and the order is
 * the teams' `turnOrder` ascending (assigned at game start, §14.5). It survives
 * a restart because it lives in the database, not in memory.
 *
 * The order is the participants (teams with a non-null `turnOrder`) sorted by
 * that order; the first presenter is `order[0]`. There is no answer/shop-style
 * timer here — defense pacing is host-driven (Finish/Skip), so no
 * {@link ClockPort} and no timer registry.
 *
 * Emission order is fixed and room-wide/public (no secret to gate): `started`
 * (the whole order) FIRST, then `team-started` (the first presenter). Both fire
 * inside the transaction, as the shop/presentation lifecycles do.
 */
@Injectable()
export class StartDefenseUseCase {
  constructor(
    @Inject(ROOM_REPOSITORY_PORT) private readonly rooms: RoomRepositoryPort,
    @Inject(TEAM_REPOSITORY_PORT) private readonly teams: TeamRepositoryPort,
    @Inject(REALTIME_EVENTS_PORT)
    private readonly realtime: RealtimeEventsPort,
    @Inject(TRANSACTION_PORT) private readonly tx: TransactionPort,
  ) {}

  async execute(input: StartDefenseInput): Promise<StartDefenseResult> {
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

      const roomTeams = await this.teams.findByRoomId(room.id);
      // §14.5 presentation order: participants (non-null turnOrder) ascending —
      // the SAME projection the battle turn uses (review-answer moveToNextTurn).
      const order = roomTeams
        .filter((team) => team.turnOrder !== null)
        .sort((a, b) => (a.turnOrder ?? 0) - (b.turnOrder ?? 0));
      const first = order[0];

      room.transitionTo('PRESENTATION_DEFENSE');
      room.assignCurrentTeam(first.id);
      await this.rooms.update(room);

      const orderIds = order.map((team) => team.id);
      this.realtime.emitToRoom(room.id, DefenseEvent.Started, {
        roomId: room.id,
        order: orderIds,
      });
      this.realtime.emitToRoom(room.id, DefenseEvent.TeamStarted, {
        roomId: room.id,
        teamId: first.id,
      });

      return {
        stage: room.currentStage,
        currentPresenterTeamId: first.id,
        order: orderIds,
      };
    });
  }
}
